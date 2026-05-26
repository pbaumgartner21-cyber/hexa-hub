const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.MessageUpdate,

  async execute(oldMessage, newMessage, client) {
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await sendModLog(client, {
      type: 'message',
      title: '✏️ Message modifié',
      description: `Un message a été modifié dans ${newMessage.channel}.`,
      fields: [
        { name: 'Auteur', value: newMessage.author ? `${newMessage.author}` : 'inconnu', inline: true },
        { name: 'Avant', value: (oldMessage.content || 'Indisponible').slice(0, 1000), inline: false },
        { name: 'Après', value: (newMessage.content || 'Indisponible').slice(0, 1000), inline: false }
      ]
    });
  }
};
