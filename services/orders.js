const { readDataStore, writeDataStore } = require('../utils/discordDataStore');

function createEmptyStore() {
  return { orders: {}, statsMessage: null };
}

async function readStore() {
  const store = await readDataStore('orders', createEmptyStore);

  if (!store.orders || typeof store.orders !== 'object') {
    store.orders = {};
  }

  if (!store.statsMessage || typeof store.statsMessage !== 'object') {
    store.statsMessage = null;
  }

  return store;
}

async function writeStore(store) {
  return writeDataStore('orders', store);
}

function createOrderId() {
  return `HH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function userSnapshot(user, member) {
  return {
    id: user.id,
    username: user.username,
    tag: user.tag,
    displayName: member?.displayName || user.globalName || user.username
  };
}

function orderSummary(order) {
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    categoryId: order.categoryId,
    categoryName: order.categoryName,
    price: order.price,
    quantity: order.quantity || 1,
    items: order.items || [],
    source: order.source || 'discord',
    customerNote: order.customerNote || null,
    createdAt: order.createdAt
  };
}

function parsePrice(value) {
  const match = String(value || '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);
  const price = match ? Number.parseFloat(match[0]) : Number.NaN;

  return Number.isFinite(price) ? Number(price.toFixed(2)) : 0;
}

async function createOrder({ user, member, product, category, source = 'discord', customerNote = null }) {
  const store = await readStore();
  const now = new Date().toISOString();
  const orderItems = Array.isArray(product?.items)
    ? product.items
    : null;
  const items = orderItems || [
    {
      productId: product.id,
      productName: product.name,
      categoryId: category.id,
      categoryName: category.name,
      price: product.price,
      quantity: 1,
      imageUrl: product.imageUrl || null
    }
  ];
  const totalQuantity = items.reduce((total, item) => total + Number(item.quantity || 1), 0);
  const totalPrice = product.totalPrice || product.price;
  const firstItem = items[0];
  const order = {
    id: createOrderId(),
    user: userSnapshot(user, member),
    productId: firstItem.productId,
    productName: items.length === 1
      ? firstItem.productName
      : `${items.length} produits`,
    categoryId: firstItem.categoryId,
    categoryName: items.length === 1
      ? firstItem.categoryName
      : 'Panier multiple',
    price: totalPrice,
    totalPrice,
    quantity: totalQuantity,
    items,
    status: 'ordered',
    deliveryStatus: 'pending',
    source,
    customerNote,
    createdAt: now,
    claimedAt: null,
    claimChannelId: null,
    deliveredAt: null,
    deliveredBy: null,
    vouchId: null,
    vouchStatus: null
  };

  store.orders[order.id] = order;
  await writeStore(store);

  return order;
}

async function getOrder(orderId) {
  const store = await readStore();
  return store.orders[orderId] || null;
}

async function getVouchableOrders(userId) {
  const store = await readStore();

  return Object.values(store.orders)
    .filter((order) =>
      order.user.id === userId &&
      order.status === 'ordered' &&
      !order.vouchId
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getOrdersForUser(userId, limit = 10) {
  const store = await readStore();

  return Object.values(store.orders)
    .filter((order) => order.user.id === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function getOrderStats() {
  const store = await readStore();
  const orders = Object.values(store.orders);
  const totalRevenue = orders.reduce((total, order) => total + parsePrice(order.totalPrice || order.price), 0);
  const delivered = orders.filter((order) => order.deliveryStatus === 'delivered').length;
  const pendingDelivery = orders.filter((order) => order.deliveryStatus !== 'delivered').length;
  const products = new Map();

  for (const order of orders) {
    const items = Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [{
          productName: order.productName,
          price: order.price,
          quantity: order.quantity || 1
        }];

    for (const item of items) {
      const current = products.get(item.productName) || {
        name: item.productName,
        count: 0,
        revenue: 0
      };

      const quantity = Number(item.quantity || 1);
      current.count += quantity;
      current.revenue += parsePrice(item.price) * quantity;
      products.set(item.productName, current);
    }
  }

  return {
    totalOrders: orders.length,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    delivered,
    pendingDelivery,
    topProducts: [...products.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
    statsMessage: store.statsMessage
  };
}

async function saveStatsMessage(channelId, messageId) {
  const store = await readStore();
  store.statsMessage = { channelId, messageId };
  await writeStore(store);
  return store.statsMessage;
}

async function markOrderClaimed(orderId, channelId) {
  const store = await readStore();
  const order = store.orders[orderId];

  if (!order) return null;

  order.claimedAt = order.claimedAt || new Date().toISOString();
  order.claimChannelId = channelId;
  store.orders[orderId] = order;
  await writeStore(store);

  return order;
}

async function markOrderDelivered(orderId, deliveredBy) {
  const store = await readStore();
  const order = store.orders[orderId];

  if (!order) return null;

  order.deliveryStatus = 'delivered';
  order.deliveredAt = new Date().toISOString();
  order.deliveredBy = deliveredBy;
  store.orders[orderId] = order;
  await writeStore(store);

  return order;
}

async function markOrderVouchPending(orderId, vouchId) {
  const store = await readStore();
  const order = store.orders[orderId];

  if (!order) return null;

  order.vouchId = vouchId;
  order.vouchStatus = 'pending';
  store.orders[orderId] = order;
  await writeStore(store);

  return order;
}

async function markOrderVouchApproved(orderId, vouchId) {
  const store = await readStore();
  const order = store.orders[orderId];

  if (!order) return null;

  order.vouchId = vouchId;
  order.vouchStatus = 'approved';
  store.orders[orderId] = order;
  await writeStore(store);

  return order;
}

async function markOrderVouchRejected(orderId) {
  const store = await readStore();
  const order = store.orders[orderId];

  if (!order) return null;

  order.vouchId = null;
  order.vouchStatus = null;
  store.orders[orderId] = order;
  await writeStore(store);

  return order;
}

module.exports = {
  createOrder,
  getOrder,
  getOrdersForUser,
  getOrderStats,
  getVouchableOrders,
  markOrderClaimed,
  markOrderDelivered,
  markOrderVouchApproved,
  markOrderVouchPending,
  markOrderVouchRejected,
  orderSummary,
  saveStatsMessage
};
