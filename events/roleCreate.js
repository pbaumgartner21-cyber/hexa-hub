const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.GuildRoleCreate,

  async execute(role, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '🏷️ Rôle créé',
      description: `Le rôle ${role} a été créé.`,
      fields: [
        { name: 'Nom', value: role.name, inline: true },
        { name: 'ID', value: role.id, inline: true }
      ]
    });
  }
};
