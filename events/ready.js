const { Events } = require('discord.js');
const { findBannerPath } = require('../utils/banner');
const { setDataClient } = require('../utils/discordDataStore');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    setDataClient(client);
    const bannerPath = findBannerPath();
    console.log(`[BOT] Connecte en tant que ${client.user.tag}`);
    console.log(`[BOT] Banniere: ${bannerPath || 'aucune image trouvee'}`);
    await sendModLog(client, {
      title: '🤖 Bot connecté',
      description: `${client.user.tag} est en ligne.`,
      type: 'moderation',
      fields: [
        { name: 'Bannière', value: bannerPath || 'aucune image trouvée', inline: false }
      ]
    });
  }
};
