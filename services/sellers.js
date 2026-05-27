const { readDataStore, writeDataStore } = require('../utils/discordDataStore');

function createEmptyStore() {
  return {
    publicMessage: null,
    applications: {},
    sellers: {}
  };
}

function slugify(value) {
  return String(value || 'item')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'item';
}

function createId(prefix, name) {
  return `${prefix}_${slugify(name)}_${Date.now().toString(36)}`;
}

function normalizeStock(value) {
  const stock = Number.parseInt(String(value || '0').trim(), 10);

  if (Number.isNaN(stock)) {
    throw new Error('Le stock doit etre un nombre.');
  }

  return Math.max(stock, 0);
}

function normalizeStockVariation(value) {
  const variation = Number.parseInt(String(value || '0').trim(), 10);

  if (Number.isNaN(variation) || variation === 0) {
    throw new Error('La variation doit etre un nombre positif ou negatif, exemple: 10 ou -3.');
  }

  return variation;
}

function normalizeImageUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const parsedUrl = new URL(trimmed);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Le lien image doit commencer par http:// ou https://');
  }

  return trimmed;
}

function userSnapshot(user, member) {
  return {
    id: user.id,
    username: user.username,
    tag: user.tag,
    displayName: member?.displayName || user.globalName || user.username
  };
}

function migrateStore(store) {
  if (!store.publicMessage || typeof store.publicMessage !== 'object') {
    store.publicMessage = null;
  }

  if (!store.applications || typeof store.applications !== 'object') {
    store.applications = {};
  }

  if (!store.sellers || typeof store.sellers !== 'object') {
    store.sellers = {};
  }

  for (const seller of Object.values(store.sellers)) {
    seller.tier = seller.tier === 'premium' ? 'premium' : 'standard';
    seller.products = Array.isArray(seller.products) ? seller.products : [];
    seller.category = seller.category || null;

    for (const product of seller.products) {
      product.stock = Number(product.stock || 0);
      product.status = product.status || 'draft';
    }
  }

  return store;
}

async function readStore() {
  return migrateStore(await readDataStore('sellers', createEmptyStore));
}

async function writeStore(store) {
  return writeDataStore('sellers', store);
}

async function saveSellerPublicMessage(channelId, messageId) {
  const store = await readStore();
  store.publicMessage = { channelId, messageId };
  await writeStore(store);
  return store.publicMessage;
}

async function createSellerApplication({ user, member, plan, shopName, products, experience, contact }) {
  const store = await readStore();
  const application = {
    id: createId('app', user.username),
    user: userSnapshot(user, member),
    plan: String(plan || '').toLowerCase().includes('premium') ? 'premium' : 'standard',
    shopName: String(shopName || '').trim(),
    products: String(products || '').trim(),
    experience: String(experience || '').trim(),
    contact: String(contact || '').trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null
  };

  store.applications[application.id] = application;
  await writeStore(store);
  return { application, store };
}

async function reviewSellerApplication(applicationId, status, reviewerId) {
  const store = await readStore();
  const application = store.applications[applicationId];

  if (!application) {
    throw new Error('Demande seller introuvable.');
  }

  application.status = status;
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = reviewerId;
  store.applications[application.id] = application;
  await writeStore(store);

  return { application, store };
}

function defaultSellerCategory(seller) {
  return {
    id: `seller_cat_${seller.userId}`,
    name: seller.shopName || `Catalogue ${seller.displayName || seller.username}`,
    emoji: '🛍️',
    description: 'Produits proposes par ce seller.'
  };
}

async function upsertSellerFromApplication(application, tier) {
  const store = await readStore();
  const now = new Date().toISOString();
  const existingSeller = store.sellers[application.user.id] || null;
  const seller = existingSeller || {
    userId: application.user.id,
    username: application.user.username,
    tag: application.user.tag,
    displayName: application.user.displayName,
    shopName: application.shopName || application.user.displayName,
    tier,
    category: null,
    products: [],
    createdAt: now
  };

  seller.username = application.user.username;
  seller.tag = application.user.tag;
  seller.displayName = application.user.displayName;
  seller.shopName = application.shopName || seller.shopName;
  seller.tier = tier;
  seller.updatedAt = now;

  if (tier === 'premium' && !seller.category) {
    seller.category = defaultSellerCategory(seller);
  }

  store.sellers[seller.userId] = seller;
  await writeStore(store);
  return { seller, store };
}

async function getSeller(userId) {
  const store = await readStore();
  return store.sellers[userId] || null;
}

async function ensureSellerProfile(user, member, tier = 'standard') {
  const store = await readStore();
  const now = new Date().toISOString();
  const existingSeller = store.sellers[user.id] || null;
  const seller = existingSeller || {
    userId: user.id,
    username: user.username,
    tag: user.tag,
    displayName: member?.displayName || user.globalName || user.username,
    shopName: member?.displayName || user.globalName || user.username,
    tier,
    category: null,
    products: [],
    createdAt: now
  };

  seller.tier = tier === 'premium' || seller.tier === 'premium' ? 'premium' : 'standard';
  seller.updatedAt = now;

  if (seller.tier === 'premium' && !seller.category) {
    seller.category = defaultSellerCategory(seller);
  }

  store.sellers[user.id] = seller;
  await writeStore(store);
  return { seller, store };
}

async function updateSellerCategory(userId, { name, emoji, description }) {
  const store = await readStore();
  const seller = store.sellers[userId];

  if (!seller) throw new Error('Profil seller introuvable.');
  if (seller.tier !== 'premium') throw new Error('Seuls les sellers premium peuvent modifier leur categorie.');

  seller.category = {
    id: seller.category?.id || `seller_cat_${seller.userId}`,
    name: String(name || '').trim(),
    emoji: String(emoji || '').trim() || '🛍️',
    description: String(description || '').trim() || 'Produits proposes par ce seller.'
  };
  seller.updatedAt = new Date().toISOString();
  store.sellers[userId] = seller;
  await writeStore(store);

  return { seller, store };
}

async function addSellerProduct(userId, { name, price, stock, imageUrl, description }) {
  const store = await readStore();
  const seller = store.sellers[userId];

  if (!seller) throw new Error('Profil seller introuvable.');

  const product = {
    id: createId('seller_prd', name),
    ownerId: userId,
    ownerName: seller.displayName || seller.username,
    name: String(name || '').trim(),
    price: String(price || '').trim(),
    stock: normalizeStock(stock),
    imageUrl: normalizeImageUrl(imageUrl),
    description: String(description || '').trim(),
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null
  };

  seller.products.push(product);
  seller.updatedAt = new Date().toISOString();
  store.sellers[userId] = seller;
  await writeStore(store);

  return { seller, product, store };
}

function findSellerProduct(store, productId) {
  for (const seller of Object.values(store.sellers)) {
    const product = (seller.products || []).find((item) => item.id === productId);
    if (product) return { seller, product };
  }

  return null;
}

async function updateSellerProduct(userId, productId, { name, price, stock, imageUrl, description }) {
  const store = await readStore();
  const result = findSellerProduct(store, productId);

  if (!result || result.seller.userId !== userId) {
    throw new Error('Produit seller introuvable.');
  }

  result.product.name = String(name || '').trim();
  result.product.price = String(price || '').trim();
  result.product.stock = normalizeStock(stock);
  result.product.imageUrl = String(imageUrl || '').trim()
    ? normalizeImageUrl(imageUrl)
    : result.product.imageUrl || null;
  result.product.description = String(description || '').trim();
  result.product.status = result.product.status === 'approved' ? 'draft' : result.product.status;
  result.product.updatedAt = new Date().toISOString();

  result.seller.updatedAt = new Date().toISOString();
  store.sellers[userId] = result.seller;
  await writeStore(store);

  return { seller: result.seller, product: result.product, store };
}

async function adjustSellerProductStock(userId, productId, variationValue) {
  const store = await readStore();
  const result = findSellerProduct(store, productId);

  if (!result || result.seller.userId !== userId) {
    throw new Error('Produit seller introuvable.');
  }

  const variation = normalizeStockVariation(variationValue);
  const oldStock = Number(result.product.stock || 0);
  const newStock = oldStock + variation;

  if (newStock < 0) {
    throw new Error(`Stock insuffisant. Stock actuel: ${oldStock}.`);
  }

  result.product.stock = newStock;
  result.product.updatedAt = new Date().toISOString();
  result.seller.updatedAt = new Date().toISOString();
  store.sellers[userId] = result.seller;
  await writeStore(store);

  return { seller: result.seller, product: result.product, oldStock, newStock, variation, store };
}

async function submitSellerProducts(userId) {
  const store = await readStore();
  const seller = store.sellers[userId];

  if (!seller) throw new Error('Profil seller introuvable.');

  const products = (seller.products || []).filter((product) => ['draft', 'rejected'].includes(product.status));
  const now = new Date().toISOString();

  for (const product of products) {
    product.status = 'pending';
    product.submittedAt = now;
    product.updatedAt = now;
  }

  seller.updatedAt = now;
  store.sellers[userId] = seller;
  await writeStore(store);

  return { seller, products, store };
}

async function reviewSellerProducts(userId, status, reviewerId) {
  const store = await readStore();
  const seller = store.sellers[userId];

  if (!seller) throw new Error('Profil seller introuvable.');

  const products = (seller.products || []).filter((product) => product.status === 'pending');
  const now = new Date().toISOString();

  for (const product of products) {
    product.status = status;
    product.reviewedAt = now;
    product.reviewedBy = reviewerId;
    if (status === 'approved') product.approvedAt = now;
    if (status === 'rejected') product.rejectedAt = now;
  }

  seller.updatedAt = now;
  store.sellers[userId] = seller;
  await writeStore(store);

  return { seller, products, store };
}

function getPublicSellerCategories(store) {
  const categories = [];
  const standardProducts = [];

  for (const seller of Object.values(store.sellers)) {
    const approvedProducts = (seller.products || [])
      .filter((product) => product.status === 'approved')
      .map((product) => ({
        ...product,
        sellerName: seller.displayName || seller.username,
        categoryName: seller.tier === 'premium' ? seller.category?.name : 'Sellers HEXA_HUB'
      }));

    if (approvedProducts.length === 0) continue;

    if (seller.tier === 'premium') {
      const category = seller.category || defaultSellerCategory(seller);
      categories.push({
        id: category.id,
        name: category.name,
        emoji: category.emoji || '🛍️',
        description: category.description || 'Produits premium seller.',
        sellerId: seller.userId,
        products: approvedProducts
      });
    } else {
      standardProducts.push(...approvedProducts);
    }
  }

  if (standardProducts.length > 0) {
    categories.unshift({
      id: 'standard-sellers',
      name: 'Sellers HEXA_HUB',
      emoji: '🛍️',
      description: 'Produits proposes par les sellers valides.',
      sellerId: null,
      products: standardProducts
    });
  }

  return categories;
}

module.exports = {
  addSellerProduct,
  adjustSellerProductStock,
  createSellerApplication,
  ensureSellerProfile,
  getPublicSellerCategories,
  getSeller,
  readStore,
  reviewSellerApplication,
  reviewSellerProducts,
  saveSellerPublicMessage,
  submitSellerProducts,
  updateSellerCategory,
  updateSellerProduct,
  upsertSellerFromApplication
};
