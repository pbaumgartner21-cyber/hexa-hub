const http = require('node:http');
const crypto = require('node:crypto');
const config = require('../config');
const {
  addBalance,
  authenticateEmailPassword,
  getAccount,
  sanitizeAccount,
  subtractBalance
} = require('../services/accounts');
const {
  decrementProductsStock,
  findProduct,
  getCatalogue,
  adjustProductStock
} = require('../services/catalogue');
const {
  createOrder,
  getOrdersForUser,
  getOrderStats,
  orderSummary,
  saveStatsMessage
} = require('../services/orders');
const {
  buildOrderLogMessage,
  buildRevenueStatsMessage
} = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const MAX_BODY_SIZE = 1024 * 1024;
let apiServer = null;

function parsePrice(value) {
  const match = String(value || '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);
  const price = match ? Number.parseFloat(match[0]) : Number.NaN;

  return Number.isFinite(price) ? Number(price.toFixed(2)) : null;
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}€`;
}

function allowedOrigin(requestOrigin) {
  const configuredOrigin = config.api.siteOrigin;

  if (!configuredOrigin || configuredOrigin === '*') {
    return requestOrigin || '*';
  }

  const origins = configuredOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.includes(requestOrigin) ? requestOrigin : origins[0];
}

function sendJson(req, res, statusCode, payload) {
  const origin = allowedOrigin(req.headers.origin);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;

      if (rawBody.length > MAX_BODY_SIZE) {
        reject(new Error('Body trop volumineux.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });

    req.on('error', reject);
  });
}

function signToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: account.userId,
    email: account.email,
    iat: now,
    exp: now + 7 * 24 * 60 * 60
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.api.jwtSecret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || '').split('.');

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.api.jwtSecret)
    .update(body)
    .digest('base64url');

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function requireAccount(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  const payload = verifyToken(token);

  if (!payload) {
    return null;
  }

  return getAccount(payload.sub);
}

function accountResponse(account) {
  const safeAccount = sanitizeAccount(account);

  return {
    userId: safeAccount.userId,
    username: safeAccount.username,
    displayName: safeAccount.displayName,
    email: safeAccount.email || null,
    balance: Number(safeAccount.balance || 0),
    shopBlocked: Boolean(safeAccount.shopBlocked),
    shopBlockedReason: safeAccount.shopBlockedReason || null,
    createdAt: safeAccount.createdAt,
    lastLoginAt: safeAccount.lastLoginAt
  };
}

function publicCatalogue(store) {
  return {
    categories: store.categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        emoji: category.emoji,
        description: category.description,
        products: (category.products || [])
          .filter((product) => product.publishedAt)
          .map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            stock: Number(product.stock || 0),
            imageUrl: product.imageUrl || null,
            description: product.description || '',
            categoryId: category.id,
            categoryName: category.name
          }))
      }))
      .filter((category) => category.products.length > 0)
  };
}

function normalizeCheckoutItems(items) {
  const byProduct = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const productId = String(item.productId || '').trim();
    const quantity = Number.parseInt(String(item.quantity || '1'), 10);

    if (!productId || Number.isNaN(quantity) || quantity <= 0) continue;

    byProduct.set(productId, {
      productId,
      quantity: Math.min((byProduct.get(productId)?.quantity || 0) + quantity, 999)
    });
  }

  return [...byProduct.values()].slice(0, 25);
}

async function updateRevenueStats(client) {
  const channel = await fetchTextChannel(client, config.channels.resultat);
  if (!channel) return;

  const stats = await getOrderStats();
  let message = null;

  if (stats.statsMessage?.channelId && stats.statsMessage?.messageId) {
    const statsChannel = await fetchTextChannel(client, stats.statsMessage.channelId);
    if (statsChannel) {
      message = await statsChannel.messages.fetch(stats.statsMessage.messageId).catch(() => null);
    }
  }

  if (message) {
    await message.edit(buildRevenueStatsMessage(stats)).catch(() => null);
    return;
  }

  message = await sendBotMessage(channel, buildRevenueStatsMessage(stats));
  await saveStatsMessage(channel.id, message.id);
}

async function postOrderNotifications(client, order, firstProduct) {
  const orderChannel = await fetchTextChannel(client, config.channels.commandeLogs);
  if (orderChannel) {
    await sendBotMessage(orderChannel, buildOrderLogMessage(order, firstProduct));
  }

  await updateRevenueStats(client);
  await sendModLog(client, {
    type: 'shop',
    title: '🛒 Commande site',
    description: `<@${order.user.id}> a passe une commande depuis le site.`,
    fields: [
      { name: 'Commande', value: order.id, inline: true },
      { name: 'Total', value: order.totalPrice || order.price, inline: true },
      { name: 'Articles', value: String(order.quantity || 1), inline: true }
    ]
  });
}

async function handleCheckout(req, res, client, account, body) {
  if (account.shopBlocked) {
    sendJson(req, res, 403, {
      error: 'SHOP_BLOCKED',
      message: account.shopBlockedReason || 'Compte bloque de la boutique.'
    });
    return;
  }

  const requestedItems = normalizeCheckoutItems(body.items);
  if (requestedItems.length === 0) {
    sendJson(req, res, 400, { error: 'EMPTY_CART', message: 'Panier vide.' });
    return;
  }

  const store = await getCatalogue();
  const checkoutItems = [];

  for (const item of requestedItems) {
    const result = findProduct(store, item.productId);

    if (!result || !result.product.publishedAt) {
      sendJson(req, res, 404, { error: 'PRODUCT_NOT_FOUND', message: `Produit introuvable: ${item.productId}.` });
      return;
    }

    const stock = Number(result.product.stock || 0);
    if (stock < item.quantity) {
      sendJson(req, res, 409, {
        error: 'INSUFFICIENT_STOCK',
        message: `Stock insuffisant pour ${result.product.name}.`,
        productId: item.productId,
        stock
      });
      return;
    }

    const price = parsePrice(result.product.price);
    if (price === null) {
      sendJson(req, res, 400, {
        error: 'INVALID_PRICE',
        message: `Prix invalide pour ${result.product.name}.`
      });
      return;
    }

    checkoutItems.push({
      productId: item.productId,
      quantity: item.quantity,
      price,
      product: result.product,
      category: result.category
    });
  }

  const totalPrice = checkoutItems.reduce((total, item) => total + item.price * item.quantity, 0);
  const currentBalance = Number(account.balance || 0);

  if (currentBalance < totalPrice) {
    sendJson(req, res, 402, {
      error: 'INSUFFICIENT_BALANCE',
      message: 'Solde insuffisant.',
      balance: currentBalance,
      total: totalPrice
    });
    return;
  }

  const payment = await subtractBalance(account.userId, totalPrice);
  if (!payment.ok) {
    sendJson(req, res, 402, { error: 'INSUFFICIENT_BALANCE', message: 'Solde insuffisant.' });
    return;
  }

  let stockResult = null;
  try {
    stockResult = await decrementProductsStock(requestedItems);
  } catch (error) {
    await addBalance(account, totalPrice).catch(() => null);
    sendJson(req, res, 409, { error: 'STOCK_UPDATE_FAILED', message: error.message });
    return;
  }

  const orderItems = stockResult.items.map((item) => ({
    productId: item.product.id,
    productName: item.product.name,
    categoryId: item.category.id,
    categoryName: item.category.name,
    price: item.product.price,
    quantity: item.quantity,
    imageUrl: item.product.imageUrl || null
  }));

  let order = null;
  try {
    order = await createOrder({
      user: {
        id: account.userId,
        username: account.username,
        tag: account.tag,
        globalName: account.displayName
      },
      member: null,
      product: {
        items: orderItems,
        totalPrice: formatMoney(totalPrice)
      },
      category: null,
      source: 'site',
      customerNote: String(body.note || body.deliveryNote || body.productDelivery || '').trim() || null
    });
  } catch (error) {
    await addBalance(account, totalPrice).catch(() => null);
    for (const item of stockResult.items) {
      await adjustProductStock(item.product.id, item.quantity).catch(() => null);
    }
    sendJson(req, res, 500, { error: 'ORDER_CREATE_FAILED', message: error.message });
    return;
  }

  await postOrderNotifications(client, order, stockResult.items[0]?.product).catch((error) => {
    console.warn('[API] Impossible de poster la commande site:', error.message);
  });

  sendJson(req, res, 201, {
    ok: true,
    order: orderSummary(order),
    balance: Number((payment.account.balance || 0).toFixed(2))
  });
}

async function handleRequest(req, res, client) {
  if (req.method === 'OPTIONS') {
    sendJson(req, res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if ((url.pathname === '/' || url.pathname === '/health') && req.method === 'GET') {
      sendJson(req, res, 200, {
        ok: true,
        name: 'HEXA_HUB API',
        botReady: Boolean(client.isReady?.())
      });
      return;
    }

    if (url.pathname === '/api/catalogue' && req.method === 'GET') {
      const store = await getCatalogue();
      sendJson(req, res, 200, publicCatalogue(store));
      return;
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const result = await authenticateEmailPassword(body.email, body.password);

      if (!result.ok) {
        sendJson(req, res, 401, { error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe invalide.' });
        return;
      }

      sendJson(req, res, 200, {
        token: signToken(result.account),
        account: accountResponse(result.account)
      });
      return;
    }

    if (url.pathname === '/api/me' && req.method === 'GET') {
      const account = await requireAccount(req);

      if (!account) {
        sendJson(req, res, 401, { error: 'UNAUTHORIZED', message: 'Connexion requise.' });
        return;
      }

      sendJson(req, res, 200, { account: accountResponse(account) });
      return;
    }

    if (url.pathname === '/api/orders' && req.method === 'GET') {
      const account = await requireAccount(req);

      if (!account) {
        sendJson(req, res, 401, { error: 'UNAUTHORIZED', message: 'Connexion requise.' });
        return;
      }

      const orders = await getOrdersForUser(account.userId, 50);
      sendJson(req, res, 200, { orders: orders.map(orderSummary) });
      return;
    }

    if (url.pathname === '/api/checkout' && req.method === 'POST') {
      const account = await requireAccount(req);

      if (!account) {
        sendJson(req, res, 401, { error: 'UNAUTHORIZED', message: 'Connexion requise.' });
        return;
      }

      const body = await readBody(req);
      await handleCheckout(req, res, client, account, body);
      return;
    }

    sendJson(req, res, 404, { error: 'NOT_FOUND', message: 'Route API introuvable.' });
  } catch (error) {
    console.error('[API] Erreur:', error);
    sendJson(req, res, 500, { error: 'SERVER_ERROR', message: error.message });
  }
}

function startApiServer(client) {
  if (!config.api.enabled || apiServer) {
    return apiServer;
  }

  apiServer = http.createServer((req, res) => {
    handleRequest(req, res, client);
  });

  apiServer.listen(config.api.port, '0.0.0.0', () => {
    console.log(`[API] Web service demarre sur le port ${config.api.port}`);
  });

  return apiServer;
}

module.exports = {
  startApiServer
};
