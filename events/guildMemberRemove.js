const { Events } = require('discord.js');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(member, client) {
    await sendModLog(client, {
      type: 'moderation',
      title: '👋 Membre parti',
      description: `${member.user?.tag || member.id} a quitté le serveur.`,
      fields: [
        { name: 'ID', value: member.id, inline: true }
      ]
    });
  }
};
