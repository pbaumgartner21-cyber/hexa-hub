const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getPublicSellerCategories, readStore, saveSellerPublicMessage } = require('../services/sellers');
const { buildSellerCataloguePublicMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seller-catalogue')
    .setDescription('Poste le catalogue public des sellers HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.sellerCatalogue) || interaction.channel;
    const store = await readStore();
    const categories = getPublicSellerCategories(store);
    const message = await sendBotMessage(channel, buildSellerCataloguePublicMessage({ categories }));
    await saveSellerPublicMessage(channel.id, message.id);
    await sendModLog(client, {
      type: 'shop',
      title: '🛍️ Catalogue seller posté',
      description: `${interaction.user} a posté le catalogue seller.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });

    await interaction.editReply(`Catalogue seller posté dans ${channel}.`);
  }
};
