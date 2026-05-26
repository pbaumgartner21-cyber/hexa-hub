const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.ChannelCreate,

  async execute(channel, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '📁 Salon créé',
      description: `${channel} a été créé.`,
      fields: [
        { name: 'Nom', value: channel.name || 'inconnu', inline: true },
        { name: 'ID', value: channel.id, inline: true }
      ]
    });
  }
};
