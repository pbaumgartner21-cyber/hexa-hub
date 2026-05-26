const { readDataStore, writeDataStore } = require('../utils/discordDataStore');

function createEmptyStore() {
  return {
    publicMessage: null,
    categories: []
  };
}

function migrateStore(store) {
  if (!Array.isArray(store.categories)) {
    store.categories = [];
  }

  for (const category of store.categories) {
    if (!Array.isArray(category.products)) {
      category.products = [];
    }

    for (const product of category.products) {
      product.stock = Number(product.stock || 0);
      product.pendingRestockQuantity = Number(product.pendingRestockQuantity || 0);
    }
  }

  return store;
}

async function readStore() {
  return migrateStore(await readDataStore('catalogue', createEmptyStore));
}

async function writeStore(store) {
  return writeDataStore('catalogue', store);
}

function slugify(value) {
  return value
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

function findCategory(store, categoryNameOrId) {
  const normalized = categoryNameOrId.trim().toLowerCase();

  return store.categories.find((category) =>
    category.id === categoryNameOrId ||
    category.name.toLowerCase() === normalized ||
    slugify(category.name) === slugify(categoryNameOrId)
  );
}

function findProduct(store, productId) {
  for (const category of store.categories) {
    const product = (category.products || []).find((item) => item.id === productId);

    if (product) {
      return { category, product };
    }
  }

  return null;
}

function normalizeImageUrl(value) {
  const trimmed = value.trim();
  const parsedUrl = new URL(trimmed);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Le lien image doit commencer par http:// ou https://');
  }

  return trimmed;
}

function normalizeStock(value) {
  const stock = Number.parseInt(String(value || '0').trim(), 10);

  if (Number.isNaN(stock)) {
    throw new Error('Le stock doit être un nombre.');
  }

  return Math.max(stock, 0);
}

function normalizeStockVariation(value) {
  const variation = Number.parseInt(String(value || '0').trim(), 10);

  if (Number.isNaN(variation) || variation === 0) {
    throw new Error('La variation doit être un nombre positif ou négatif, exemple: 10 ou -3.');
  }

  return variation;
}

function publicProduct(product, category, reason = 'new') {
  return {
    ...product,
    reason,
    categoryId: category.id,
    categoryName: category.name,
    categoryEmoji: category.emoji
  };
}

async function getCatalogue() {
  return readStore();
}

async function savePublicMessage(channelId, messageId) {
  const store = await readStore();
  store.publicMessage = { channelId, messageId };
  await writeStore(store);
  return store;
}

async function addCategory({ name, emoji, description }) {
  const store = await readStore();
  const existingCategory = findCategory(store, name);

  if (existingCategory) {
    existingCategory.emoji = emoji || existingCategory.emoji || '🛍️';
    existingCategory.description = description || existingCategory.description || 'Produits HEXA_HUB.';
    await writeStore(store);

    return { created: false, category: existingCategory, store };
  }

  const category = {
    id: createId('cat', name),
    name: name.trim(),
    emoji: emoji?.trim() || '🛍️',
    description: description?.trim() || 'Produits HEXA_HUB.',
    createdAt: new Date().toISOString(),
    products: []
  };

  store.categories.push(category);
  await writeStore(store);

  return { created: true, category, store };
}

async function deleteCategory(categoryId) {
  const store = await readStore();
  const category = findCategory(store, categoryId);

  if (!category) {
    return { deleted: false, category: null, store };
  }

  store.categories = store.categories.filter((item) => item.id !== category.id);
  await writeStore(store);

  return { deleted: true, category, store };
}

async function updateCategory(categoryId, { name, emoji, description }) {
  const store = await readStore();
  const category = findCategory(store, categoryId);

  if (!category) {
    throw new Error('Catégorie introuvable.');
  }

  category.name = name.trim();
  category.emoji = emoji?.trim() || category.emoji || '🛍️';
  category.description = description?.trim() || category.description || 'Produits HEXA_HUB.';
  await writeStore(store);

  return { category, store };
}

async function addProduct({ categoryId, name, price, stock, imageUrl, description }) {
  const store = await readStore();
  const category = findCategory(store, categoryId);

  if (!category) {
    throw new Error('Catégorie introuvable.');
  }

  const product = {
    id: createId('prd', name),
    name: name.trim(),
    price: price.trim(),
    stock: normalizeStock(stock),
    pendingRestockQuantity: 0,
    imageUrl: normalizeImageUrl(imageUrl),
    description: description.trim(),
    createdAt: new Date().toISOString(),
    publishedAt: null,
    restockAnnouncedAt: null
  };

  category.products.push(product);
  await writeStore(store);

  return { category, product, store };
}

async function updateProduct(productId, { name, price, stock, imageUrl, description }) {
  const store = await readStore();
  const result = findProduct(store, productId);

  if (!result) {
    throw new Error('Produit introuvable.');
  }

  const oldStock = Number(result.product.stock || 0);
  const nextStock = normalizeStock(stock);

  result.product.name = name.trim();
  result.product.price = price.trim();
  result.product.stock = nextStock;
  result.product.imageUrl = String(imageUrl || '').trim()
    ? normalizeImageUrl(imageUrl)
    : result.product.imageUrl || null;
  result.product.description = description.trim();

  if (nextStock > oldStock) {
    result.product.pendingRestockQuantity = Number(result.product.pendingRestockQuantity || 0) + (nextStock - oldStock);
    result.product.restockAnnouncedAt = null;
  } else if (nextStock < oldStock && Number(result.product.pendingRestockQuantity || 0) > 0) {
    result.product.pendingRestockQuantity = Math.max(
      Number(result.product.pendingRestockQuantity || 0) - (oldStock - nextStock),
      0
    );
  }

  await writeStore(store);

  return {
    category: result.category,
    product: result.product,
    oldStock,
    newStock: nextStock,
    store
  };
}

async function deleteProduct(productId) {
  const store = await readStore();
  const result = findProduct(store, productId);

  if (!result) {
    return { deleted: false, category: null, product: null, store };
  }

  result.category.products = (result.category.products || []).filter((product) => product.id !== productId);
  await writeStore(store);

  return {
    deleted: true,
    category: result.category,
    product: result.product,
    store
  };
}

async function adjustProductStock(productId, variationValue) {
  const store = await readStore();
  const result = findProduct(store, productId);

  if (!result) {
    throw new Error('Produit introuvable.');
  }

  const variation = normalizeStockVariation(variationValue);
  const oldStock = Number(result.product.stock || 0);
  const nextStock = oldStock + variation;

  if (nextStock < 0) {
    throw new Error(`Stock insuffisant. Stock actuel: ${oldStock}.`);
  }

  result.product.stock = nextStock;

  if (variation > 0) {
    result.product.pendingRestockQuantity = Number(result.product.pendingRestockQuantity || 0) + variation;
    result.product.restockAnnouncedAt = null;
  } else if (Number(result.product.pendingRestockQuantity || 0) > 0) {
    result.product.pendingRestockQuantity = Math.max(
      Number(result.product.pendingRestockQuantity || 0) + variation,
      0
    );
  }

  await writeStore(store);

  return {
    category: result.category,
    product: result.product,
    variation,
    oldStock,
    newStock: nextStock,
    store
  };
}

async function decrementProductStock(productId, quantity = 1) {
  const store = await readStore();
  const result = findProduct(store, productId);

  if (!result) {
    throw new Error('Produit introuvable.');
  }

  const currentStock = Number(result.product.stock || 0);
  if (currentStock < quantity) {
    throw new Error('Stock insuffisant.');
  }

  result.product.stock = currentStock - quantity;
  await writeStore(store);

  return {
    category: result.category,
    product: result.product,
    oldStock: currentStock,
    newStock: result.product.stock,
    store
  };
}

async function decrementProductsStock(items) {
  const store = await readStore();
  const normalizedItems = [];

  for (const item of items || []) {
    const productId = String(item.productId || '').trim();
    const quantity = Number.parseInt(String(item.quantity || '1'), 10);

    if (!productId || Number.isNaN(quantity) || quantity <= 0) continue;

    const existingItem = normalizedItems.find((entry) => entry.productId === productId);
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      normalizedItems.push({ productId, quantity });
    }
  }

  if (normalizedItems.length === 0) {
    throw new Error('Panier vide.');
  }

  const results = [];
  for (const item of normalizedItems) {
    const result = findProduct(store, item.productId);

    if (!result) {
      throw new Error(`Produit introuvable: ${item.productId}.`);
    }

    const currentStock = Number(result.product.stock || 0);
    if (currentStock < item.quantity) {
      throw new Error(`Stock insuffisant pour ${result.product.name}. Stock actuel: ${currentStock}.`);
    }

    results.push({
      category: result.category,
      product: result.product,
      quantity: item.quantity,
      oldStock: currentStock,
      newStock: currentStock - item.quantity
    });
  }

  for (const result of results) {
    result.product.stock = result.newStock;
  }

  await writeStore(store);

  return {
    items: results,
    store
  };
}

async function markCataloguePublished() {
  const store = await readStore();
  const now = new Date().toISOString();
  const productsToAnnounce = [];

  for (const category of store.categories) {
    for (const product of category.products || []) {
      if (!product.publishedAt) {
        productsToAnnounce.push(publicProduct(product, category, 'new'));
      } else if (Number(product.pendingRestockQuantity || 0) > 0) {
        productsToAnnounce.push(publicProduct(product, category, 'stock'));
      }

      product.publishedAt = product.publishedAt || now;
    }
  }

  await writeStore(store);
  return { store, productsToAnnounce };
}

async function markRestockAnnounced(productIds) {
  const store = await readStore();
  const now = new Date().toISOString();

  for (const category of store.categories) {
    for (const product of category.products || []) {
      if (productIds.includes(product.id)) {
        product.restockAnnouncedAt = now;
        product.pendingRestockQuantity = 0;
        product.publishedAt = product.publishedAt || now;
      }
    }
  }

  await writeStore(store);
  return store;
}

module.exports = {
  addCategory,
  addProduct,
  adjustProductStock,
  decrementProductStock,
  decrementProductsStock,
  deleteCategory,
  deleteProduct,
  findCategory,
  findProduct,
  getCatalogue,
  markCataloguePublished,
  markRestockAnnounced,
  savePublicMessage,
  updateCategory,
  updateProduct
};
