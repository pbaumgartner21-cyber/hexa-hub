const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.MessageBulkDelete,

  async execute(messages, client) {
    const firstMessage = messages.first();

    await sendModLog(client, {
      type: 'message',
      title: '🧹 Messages supprimés en masse',
      description: `${messages.size} message(s) supprimé(s).`,
      fields: [
        { name: 'Salon', value: firstMessage?.channel ? `${firstMessage.channel}` : 'inconnu', inline: true }
      ]
    });
  }
};
