const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.GuildBanAdd,

  async execute(ban, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '🔨 Membre banni',
      description: `${ban.user.tag} a été banni.`,
      fields: [
        { name: 'ID', value: ban.user.id, inline: true },
        { name: 'Raison', value: ban.reason || 'Aucune raison.', inline: false }
      ]
    });
  }
};
