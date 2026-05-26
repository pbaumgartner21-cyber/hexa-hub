const crypto = require('node:crypto');
const { readDataStore, writeDataStore } = require('../utils/discordDataStore');

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = 'sha512';

function createEmptyStore() {
  return { users: {} };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('hex');

  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;

  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  return hashBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(hashBuffer, expectedBuffer);
}

function sanitizeAccount(account) {
  if (!account) return null;

  const {
    passwordHash,
    passwordSalt,
    ...safeAccount
  } = account;

  return safeAccount;
}

function normalizeCartItems(account) {
  const cartItems = Array.isArray(account.cartItems)
    ? account.cartItems
    : [];

  if (account.cartProductId && !cartItems.some((item) => item.productId === account.cartProductId)) {
    cartItems.push({ productId: account.cartProductId, quantity: 1 });
  }

  const byProduct = new Map();
  for (const item of cartItems) {
    const productId = String(item.productId || '').trim();
    const quantity = Number.parseInt(String(item.quantity || '1'), 10);

    if (!productId || Number.isNaN(quantity) || quantity <= 0) continue;

    byProduct.set(productId, {
      productId,
      quantity: Math.min((byProduct.get(productId)?.quantity || 0) + quantity, 999)
    });
  }

  return [...byProduct.values()];
}

function normalizeAccount(account) {
  account.balance = Number(account.balance || 0);
  account.shopBlocked = Boolean(account.shopBlocked);
  account.privateChannelId = account.privateChannelId || null;
  account.privateMessageId = account.privateMessageId || null;
  account.email = normalizeEmail(account.email) || null;
  account.passwordHash = account.passwordHash || null;
  account.passwordSalt = account.passwordSalt || null;
  account.passwordUpdatedAt = account.passwordUpdatedAt || null;
  account.cartItems = normalizeCartItems(account);
  account.cartProductId = account.cartItems[0]?.productId || null;
  account.cartUpdatedAt = account.cartItems.length > 0 ? account.cartUpdatedAt || new Date().toISOString() : null;
  return account;
}

async function readStore() {
  const store = await readDataStore('accounts', createEmptyStore);

  if (!store.users || typeof store.users !== 'object') {
    store.users = {};
  }

  for (const [userId, account] of Object.entries(store.users)) {
    store.users[userId] = normalizeAccount(account);
  }

  return store;
}

async function writeStore(store) {
  return writeDataStore('accounts', store);
}

function accountFromUser(user, member) {
  const now = new Date().toISOString();

  return {
    userId: user.id,
    username: user.username,
    tag: user.tag,
    displayName: member?.displayName || user.globalName || user.username,
    balance: 0,
    shopBlocked: false,
    shopBlockedReason: null,
    privateChannelId: null,
    privateMessageId: null,
    email: null,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    cartItems: [],
    cartProductId: null,
    cartUpdatedAt: null,
    createdAt: now,
    lastLoginAt: now
  };
}

async function createAccount(user, member) {
  const store = await readStore();
  const existingAccount = store.users[user.id];

  if (existingAccount) {
    normalizeAccount(existingAccount);
    existingAccount.lastLoginAt = existingAccount.lastLoginAt || new Date().toISOString();
    store.users[user.id] = existingAccount;
    await writeStore(store);

    return {
      created: false,
      account: existingAccount,
      totalAccounts: Object.keys(store.users).length
    };
  }

  const account = accountFromUser(user, member);
  store.users[user.id] = account;
  await writeStore(store);

  return {
    created: true,
    account,
    totalAccounts: Object.keys(store.users).length
  };
}

function findAccountByEmail(store, email) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return null;

  return Object.values(store.users).find((account) => normalizeEmail(account.email) === normalizedEmail) || null;
}

async function createAccountWithCredentials(user, member, email, password) {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Email invalide.');
  }

  if (String(password || '').length < 8) {
    throw new Error('Le mot de passe doit contenir au moins 8 caracteres.');
  }

  const store = await readStore();
  const existingAccount = store.users[user.id];
  const emailOwner = findAccountByEmail(store, normalizedEmail);

  if (emailOwner && emailOwner.userId !== user.id) {
    throw new Error('Cet email est deja utilise par un autre compte.');
  }

  const now = new Date().toISOString();
  const credentials = hashPassword(password);
  const account = existingAccount || accountFromUser(user, member);

  normalizeAccount(account);
  account.userId = user.id;
  account.username = user.username;
  account.tag = user.tag;
  account.displayName = member?.displayName || user.globalName || user.username;
  account.email = normalizedEmail;
  account.passwordHash = credentials.hash;
  account.passwordSalt = credentials.salt;
  account.passwordUpdatedAt = now;
  account.lastLoginAt = now;

  store.users[user.id] = account;
  await writeStore(store);

  return {
    created: !existingAccount,
    account,
    totalAccounts: Object.keys(store.users).length
  };
}

async function getAccount(userId) {
  const store = await readStore();
  return store.users[userId] || null;
}

async function authenticateEmailPassword(email, password) {
  const store = await readStore();
  const account = findAccountByEmail(store, email);

  if (!account) {
    return { ok: false, reason: 'INVALID_CREDENTIALS', account: null };
  }

  if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
    return { ok: false, reason: 'INVALID_CREDENTIALS', account: null };
  }

  account.lastLoginAt = new Date().toISOString();
  store.users[account.userId] = account;
  await writeStore(store);

  return { ok: true, account };
}

async function loginAccount(user) {
  const store = await readStore();
  const account = store.users[user.id];

  if (!account) {
    return { exists: false, account: null };
  }

  normalizeAccount(account);
  account.lastLoginAt = new Date().toISOString();
  store.users[user.id] = account;
  await writeStore(store);

  return { exists: true, account };
}

async function addBalance(userData, amount) {
  const store = await readStore();
  const userId = userData.id || userData.userId;
  const now = new Date().toISOString();

  if (!store.users[userId]) {
    store.users[userId] = {
      userId,
      username: userData.username || 'unknown',
      tag: userData.tag || userData.username || 'unknown',
      displayName: userData.displayName || userData.globalName || userData.username || 'Membre',
      balance: 0,
      shopBlocked: false,
      shopBlockedReason: null,
      privateChannelId: null,
      privateMessageId: null,
      email: null,
      passwordHash: null,
      passwordSalt: null,
      passwordUpdatedAt: null,
      cartItems: [],
      cartProductId: null,
      cartUpdatedAt: null,
      createdAt: now,
      lastLoginAt: null
    };
  }

  const account = store.users[userId];
  account.balance = Number(account.balance || 0) + amount;
  await writeStore(store);

  return account;
}

async function setShopBlocked(userId, blocked, reason = '') {
  const store = await readStore();
  const now = new Date().toISOString();

  if (!store.users[userId]) {
    store.users[userId] = {
      userId,
      username: 'unknown',
      tag: 'unknown',
      displayName: 'Membre',
      balance: 0,
      shopBlocked: false,
      shopBlockedReason: null,
      privateChannelId: null,
      privateMessageId: null,
      email: null,
      passwordHash: null,
      passwordSalt: null,
      passwordUpdatedAt: null,
      cartItems: [],
      cartProductId: null,
      cartUpdatedAt: null,
      createdAt: now,
      lastLoginAt: null
    };
  }

  store.users[userId].shopBlocked = blocked;
  store.users[userId].shopBlockedReason = blocked ? reason || 'Aucune raison indiquée.' : null;
  await writeStore(store);

  return store.users[userId];
}

async function deleteAccount(userId) {
  const store = await readStore();
  const account = store.users[userId] || null;

  if (account) {
    delete store.users[userId];
    await writeStore(store);
  }

  return { deleted: Boolean(account), account };
}

async function setAccountPrivateMessage(userId, channelId, messageId) {
  const store = await readStore();
  const account = store.users[userId];

  if (!account) {
    return null;
  }

  account.privateChannelId = channelId;
  account.privateMessageId = messageId;
  store.users[userId] = account;
  await writeStore(store);

  return account;
}

async function setCartProduct(userId, productId) {
  return addCartItem(userId, productId, 1);
}

async function addCartItem(userId, productId, quantity = 1) {
  const store = await readStore();
  const account = store.users[userId];

  if (!account) {
    return null;
  }

  const parsedQuantity = Number.parseInt(String(quantity || '1'), 10);
  const safeQuantity = Number.isNaN(parsedQuantity) ? 1 : Math.max(parsedQuantity, 1);
  account.cartItems = normalizeCartItems(account);
  const existingItem = account.cartItems.find((item) => item.productId === productId);

  if (existingItem) {
    existingItem.quantity = Math.min(existingItem.quantity + safeQuantity, 999);
  } else {
    account.cartItems.push({ productId, quantity: Math.min(safeQuantity, 999) });
  }

  account.cartProductId = account.cartItems[0]?.productId || null;
  account.cartUpdatedAt = new Date().toISOString();
  store.users[userId] = account;
  await writeStore(store);

  return account;
}

async function addCartItems(userId, items) {
  const store = await readStore();
  const account = store.users[userId];

  if (!account) {
    return null;
  }

  account.cartItems = normalizeCartItems(account);

  for (const item of items) {
    const productId = String(item.productId || '').trim();
    const quantity = Number.parseInt(String(item.quantity || '1'), 10);

    if (!productId || Number.isNaN(quantity) || quantity <= 0) continue;

    const existingItem = account.cartItems.find((cartItem) => cartItem.productId === productId);
    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + quantity, 999);
    } else {
      account.cartItems.push({ productId, quantity: Math.min(quantity, 999) });
    }
  }

  account.cartProductId = account.cartItems[0]?.productId || null;
  account.cartUpdatedAt = account.cartItems.length > 0 ? new Date().toISOString() : null;
  store.users[userId] = account;
  await writeStore(store);

  return account;
}

async function clearCartProduct(userId) {
  const store = await readStore();
  const account = store.users[userId];

  if (!account) {
    return null;
  }

  account.cartProductId = null;
  account.cartItems = [];
  account.cartUpdatedAt = null;
  store.users[userId] = account;
  await writeStore(store);

  return account;
}

async function subtractBalance(userId, amount) {
  const store = await readStore();
  const account = store.users[userId];

  if (!account) {
    return { ok: false, reason: 'NO_ACCOUNT', account: null };
  }

  const currentBalance = Number(account.balance || 0);
  if (currentBalance < amount) {
    return { ok: false, reason: 'INSUFFICIENT_BALANCE', account };
  }

  account.balance = Number((currentBalance - amount).toFixed(2));
  store.users[userId] = account;
  await writeStore(store);

  return { ok: true, account };
}

module.exports = {
  addBalance,
  addCartItem,
  addCartItems,
  authenticateEmailPassword,
  clearCartProduct,
  createAccount,
  createAccountWithCredentials,
  deleteAccount,
  getAccount,
  loginAccount,
  sanitizeAccount,
  setAccountPrivateMessage,
  setCartProduct,
  subtractBalance,
  setShopBlocked
};
