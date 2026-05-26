const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.ChannelUpdate,

  async execute(oldChannel, newChannel, client) {
    if (oldChannel.name === newChannel.name) return;

    await sendModLog(client, {
      type: 'moderation',
      title: '📁 Salon modifié',
      description: `${newChannel} a été modifié.`,
      fields: [
        { name: 'Avant', value: oldChannel.name || 'inconnu', inline: true },
        { name: 'Après', value: newChannel.name || 'inconnu', inline: true },
        { name: 'ID', value: newChannel.id, inline: true }
      ]
    });
  }
};
