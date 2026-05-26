const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.GuildRoleDelete,

  async execute(role, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '🏷️ Rôle supprimé',
      description: `Un rôle a été supprimé.`,
      fields: [
        { name: 'Nom', value: role.name, inline: true },
        { name: 'ID', value: role.id, inline: true }
      ]
    });
  }
};
