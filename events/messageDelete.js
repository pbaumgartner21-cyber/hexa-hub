const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.MessageDelete,

  async execute(message, client) {
    if (message.author?.bot) return;

    await sendModLog(client, {
      type: 'message',
      title: '🗑️ Message supprimé',
      description: `Un message a été supprimé dans ${message.channel}.`,
      fields: [
        { name: 'Auteur', value: message.author ? `${message.author}` : 'inconnu', inline: true },
        { name: 'Salon', value: `${message.channel}`, inline: true },
        { name: 'Contenu', value: (message.content || 'Contenu indisponible').slice(0, 1000), inline: false }
      ]
    });
  }
};
