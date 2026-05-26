const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.GuildBanRemove,

  async execute(ban, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '✅ Membre débanni',
      description: `${ban.user.tag} a été débanni.`,
      fields: [
        { name: 'ID', value: ban.user.id, inline: true }
      ]
    });
  }
};
