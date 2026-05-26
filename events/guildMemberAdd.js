const { Events } = require('discord.js');
const config = require('../config');
const { buildWelcomeMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  name: Events.GuildMemberAdd,

  async execute(member, client) {
    const channel = await fetchTextChannel(client, config.channels.welcome);
    if (!channel) {
      console.warn('[WELCOME] Salon introuvable. Verifie WELCOME_CHANNEL_ID dans .env.');
      return;
    }

    await sendBotMessage(channel, buildWelcomeMessage(member));
    await sendModLog(client, {
      title: '👋 Nouveau membre',
      description: `${member} a rejoint le serveur.`,
      fields: [
        { name: 'ID', value: member.id, inline: true }
      ]
    });
  }
};
