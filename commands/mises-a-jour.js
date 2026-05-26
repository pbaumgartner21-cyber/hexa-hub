const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildUpdateMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendBotMessage } = require('../utils/messages');

function normalizeText(value) {
  return value.trim().replace(/\\n/g, '\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mises-a-jour')
    .setDescription('Poste une annonce de mise a jour HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('titre')
        .setDescription('Exemple: 🚀 VERSION V1.1')
        .setRequired(true)
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName('texte')
        .setDescription('Texte de l annonce. Tu peux ecrire \\n pour aller a la ligne.')
        .setRequired(true)
        .setMaxLength(3900)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.updates);
    if (!channel) {
      await interaction.editReply('Impossible de trouver le salon mises-a-jour. Verifie UPDATES_CHANNEL_ID dans .env.');
      return;
    }

    const title = normalizeText(interaction.options.getString('titre', true));
    const text = normalizeText(interaction.options.getString('texte', true));

    await sendBotMessage(channel, buildUpdateMessage(title, text));
    await interaction.editReply(`Mise a jour postee dans ${channel}.`);
  }
};
