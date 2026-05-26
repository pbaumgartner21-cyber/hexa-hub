const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getCatalogue } = require('../services/catalogue');
const { buildCatalogueAdminMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('catalogue-admin')
    .setDescription('Poste le panneau admin du catalogue HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.catalogueAdmin);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon admin catalogue. Verifie CATALOGUE_ADMIN_CHANNEL_ID dans .env.');
      return;
    }

    const store = await getCatalogue();
    await sendBotMessage(channel, buildCatalogueAdminMessage(store));
    await sendModLog(client, {
      type: 'shop',
      title: '🛍️ Panel catalogue admin posté',
      description: `${interaction.user} a posté le panel catalogue admin.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });

    await interaction.editReply(`Panneau admin catalogue poste dans ${channel}.`);
  }
};
