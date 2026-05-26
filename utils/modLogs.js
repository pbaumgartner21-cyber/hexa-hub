const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { fetchTextChannel } = require('./channels');
const { sendBotMessage } = require('./messages');

const LOG_TYPES = {
  message: 'messages',
  voice: 'voice',
  ticket: 'tickets',
  moderation: 'moderation',
  shop: 'shop'
};

function resolveLogChannelId(type) {
  const normalizedType = LOG_TYPES[type] || LOG_TYPES.moderation;
  return config.logs?.[normalizedType] || config.channels.modLogs;
}

async function sendModLog(client, { title, description, fields = [], type = 'moderation' }) {
  const channelId = resolveLogChannelId(type);
  const channel = await fetchTextChannel(client, channelId);

  if (!channel) {
    console.warn(`[LOGS] Salon de logs introuvable pour ${type}.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'HEXA_HUB LOGS' })
    .setTitle(title)
    .setDescription(description)
    .setColor(config.embedColor)
    .setFooter({ text: 'HEXA_HUB • LOGS' })
    .setTimestamp();

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  await sendBotMessage(channel, { embeds: [embed] }).catch((error) => {
    console.warn('[LOGS] Impossible de poster une log:', error.message);
  });
}

module.exports = {
  sendModLog
};
