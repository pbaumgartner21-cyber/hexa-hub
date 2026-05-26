const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.ChannelDelete,

  async execute(channel, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '🗑️ Salon supprimé',
      description: `Un salon a été supprimé.`,
      fields: [
        { name: 'Nom', value: channel.name || 'inconnu', inline: true },
        { name: 'ID', value: channel.id, inline: true }
      ]
    });
  }
};
