const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getVouchStats, savePanelMessage } = require('../services/vouches');
const { buildVouchPanelMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Poste le panel des avis HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.vouchPanel);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon vouch. Verifie VOUCH_PANEL_CHANNEL_ID dans .env.');
      return;
    }

    const stats = await getVouchStats();
    const message = await sendBotMessage(channel, buildVouchPanelMessage(stats));
    await savePanelMessage(channel.id, message.id);
    await sendModLog(client, {
      type: 'shop',
      title: '⭐ Panel vouch posté',
      description: `${interaction.user} a posté le panel vouch.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });

    await interaction.editReply(`Panel vouch poste dans ${channel}.`);
  }
};
