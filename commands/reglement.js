const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildRulesMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglement')
    .setDescription('Poste le reglement officiel HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.rules);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon du reglement. Verifie RULES_CHANNEL_ID dans .env.');
      return;
    }

    await sendBotMessage(channel, buildRulesMessage());
    await interaction.editReply(`Reglement poste dans ${channel}.`);
  }
};
