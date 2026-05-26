const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildShopStatusMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Poste le statut de la boutique HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('etat')
        .setDescription('Choisis si la boutique est ouverte ou fermee.')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Boutique ouverte', value: 'open' },
          { name: '🔴 Boutique fermée', value: 'closed' }
        )
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.shopStatus);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon status. Verifie SHOP_STATUS_CHANNEL_ID dans .env.');
      return;
    }

    const isOpen = interaction.options.getString('etat', true) === 'open';
    await sendBotMessage(channel, buildShopStatusMessage(isOpen));
    await sendModLog(client, {
      type: 'shop',
      title: '🟢 Statut boutique modifié',
      description: `${interaction.user} a posté le statut boutique.`,
      fields: [
        { name: 'État', value: isOpen ? 'Ouverte' : 'Fermée', inline: true },
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });
    await interaction.editReply(`Status boutique poste dans ${channel}.`);
  }
};
