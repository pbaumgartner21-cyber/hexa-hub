const { AttachmentBuilder } = require('discord.js');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');

const DATA_MARKER_PREFIX = 'HEXA_HUB_DATA';
let dataClient = null;

function setDataClient(client) {
  dataClient = client;
}

function getDataChannelId(storeName) {
  return config.dataChannels?.[storeName] || '';
}

async function fetchDataChannel(storeName) {
  if (!dataClient) {
    throw new Error('Client Discord data non initialise.');
  }

  const channelId = getDataChannelId(storeName);
  if (!channelId) {
    throw new Error(`Salon data manquant pour ${storeName}.`);
  }

  const channel = await dataClient.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Salon data introuvable pour ${storeName}.`);
  }

  return channel;
}

function markerFor(storeName) {
  return `[${DATA_MARKER_PREFIX}:${storeName}]`;
}

function findDataMessages(messages, storeName) {
  const marker = markerFor(storeName);

  return [...messages.values()]
    .filter((message) => message.author?.id === dataClient.user.id)
    .filter((message) => message.content?.includes(marker))
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

async function readDataStore(storeName, createDefaultStore) {
  const channel = await fetchDataChannel(storeName);
  const messages = await channel.messages.fetch({ limit: 50 });
  const [latestMessage] = findDataMessages(messages, storeName);

  if (!latestMessage) {
    const localStore = await readLocalStore(storeName).catch(() => null);
    const store = localStore || createDefaultStore();
    await writeDataStore(storeName, store);
    return store;
  }

  const attachment = latestMessage.attachments.find((file) => file.name === `${storeName}.json`);
  if (!attachment) {
    return createDefaultStore();
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Impossible de lire la data ${storeName}.`);
  }

  return JSON.parse(await response.text());
}

async function readLocalStore(storeName) {
  const localPath = path.join(process.cwd(), 'data', `${storeName}.json`);
  const rawStore = await fs.readFile(localPath, 'utf8');
  return JSON.parse(rawStore);
}

async function cleanupOldDataMessages(channel, storeName, keepMessageId) {
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return;

  const oldMessages = findDataMessages(messages, storeName)
    .filter((message) => message.id !== keepMessageId)
    .slice(0, 10);

  for (const message of oldMessages) {
    await message.delete().catch(() => null);
  }
}

async function writeDataStore(storeName, store) {
  const channel = await fetchDataChannel(storeName);
  const json = JSON.stringify(store, null, 2);
  const attachment = new AttachmentBuilder(Buffer.from(json, 'utf8'), {
    name: `${storeName}.json`
  });

  const message = await channel.send({
    content: `${markerFor(storeName)} ${new Date().toISOString()}`,
    files: [attachment]
  });

  await cleanupOldDataMessages(channel, storeName, message.id);
  return store;
}

module.exports = {
  readDataStore,
  setDataClient,
  writeDataStore
};
