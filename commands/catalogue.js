const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getCatalogue, savePublicMessage } = require('../services/catalogue');
const { buildCataloguePublicMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('catalogue')
    .setDescription('Poste le catalogue public HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.catalogue);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon catalogue. Verifie CATALOGUE_CHANNEL_ID dans .env.');
      return;
    }

    const store = await getCatalogue();
    const message = await sendBotMessage(channel, buildCataloguePublicMessage(store));
    await savePublicMessage(channel.id, message.id);
    await sendModLog(client, {
      type: 'shop',
      title: '🛍️ Catalogue public posté',
      description: `${interaction.user} a posté un nouveau message catalogue public.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });

    await interaction.editReply(`Catalogue public poste dans ${channel}.`);
  }
};
