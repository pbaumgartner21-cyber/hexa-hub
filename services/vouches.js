const { readDataStore, writeDataStore } = require('../utils/discordDataStore');

function createEmptyStore() {
  return {
    panelMessage: null,
    vouches: {}
  };
}

async function readStore() {
  const store = await readDataStore('vouches', createEmptyStore);

  if (!store.panelMessage) {
    store.panelMessage = null;
  }

  if (!store.vouches || typeof store.vouches !== 'object') {
    store.vouches = {};
  }

  return store;
}

async function writeStore(store) {
  return writeDataStore('vouches', store);
}

function createId() {
  return `vouch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function userSnapshot(user, member) {
  return {
    id: user.id,
    username: user.username,
    tag: user.tag,
    displayName: member?.displayName || user.globalName || user.username
  };
}

function normalizeRating(value) {
  const rating = Number.parseInt(String(value).trim(), 10);

  if (Number.isNaN(rating) || rating < 1 || rating > 5) {
    throw new Error('La note doit être entre 1 et 5.');
  }

  return rating;
}

function getStatsFromStore(store) {
  const approved = Object.values(store.vouches).filter((vouch) => vouch.status === 'approved');
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const vouch of approved) {
    counts[vouch.rating] += 1;
  }

  const total = approved.length;
  const average = total === 0
    ? 0
    : approved.reduce((sum, vouch) => sum + vouch.rating, 0) / total;

  return {
    total,
    average,
    counts
  };
}

async function getVouchStats() {
  const store = await readStore();
  return getStatsFromStore(store);
}

async function savePanelMessage(channelId, messageId) {
  const store = await readStore();
  store.panelMessage = { channelId, messageId };
  await writeStore(store);
  return store;
}

async function createPendingVouch({ user, member, order, rating, description }) {
  const store = await readStore();
  const id = createId();
  const now = new Date().toISOString();
  const vouch = {
    id,
    user: userSnapshot(user, member),
    order,
    rating: normalizeRating(rating),
    description: description.trim(),
    status: 'pending',
    createdAt: now,
    approvedAt: null,
    rejectedAt: null,
    moderatorId: null
  };

  store.vouches[id] = vouch;
  await writeStore(store);

  return vouch;
}

async function approveVouch(vouchId, moderatorId) {
  const store = await readStore();
  const vouch = store.vouches[vouchId];

  if (!vouch) {
    return { found: false, changed: false, vouch: null, stats: getStatsFromStore(store) };
  }

  if (vouch.status === 'approved') {
    return { found: true, changed: false, vouch, stats: getStatsFromStore(store), panelMessage: store.panelMessage };
  }

  vouch.status = 'approved';
  vouch.approvedAt = new Date().toISOString();
  vouch.moderatorId = moderatorId;
  store.vouches[vouchId] = vouch;
  await writeStore(store);

  return { found: true, changed: true, vouch, stats: getStatsFromStore(store), panelMessage: store.panelMessage };
}

async function rejectVouch(vouchId, moderatorId) {
  const store = await readStore();
  const vouch = store.vouches[vouchId];

  if (!vouch) {
    return { found: false, vouch: null, stats: getStatsFromStore(store) };
  }

  vouch.status = 'rejected';
  vouch.rejectedAt = new Date().toISOString();
  vouch.moderatorId = moderatorId;
  store.vouches[vouchId] = vouch;
  await writeStore(store);

  return { found: true, vouch, stats: getStatsFromStore(store), panelMessage: store.panelMessage };
}

module.exports = {
  approveVouch,
  createPendingVouch,
  getVouchStats,
  rejectVouch,
  savePanelMessage
};
