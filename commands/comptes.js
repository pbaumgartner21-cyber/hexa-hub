const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildAccountsPanelMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comptes')
    .setDescription('Poste le panel de creation et connexion de compte HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.accounts);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon comptes. Verifie ACCOUNTS_CHANNEL_ID dans .env.');
      return;
    }

    await sendBotMessage(channel, buildAccountsPanelMessage());
    await interaction.editReply(`Panel comptes poste dans ${channel}.`);
  }
};
