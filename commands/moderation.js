const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { buildModerationPanelMessage } = require('../templates/embeds');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Poste le panel de modération HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    await sendBotMessage(interaction.channel, buildModerationPanelMessage());
    await sendModLog(client, {
      type: 'moderation',
      title: '🛡️ Panel modération posté',
      description: `${interaction.user} a posté le panel modération.`,
      fields: [
        { name: 'Salon', value: `${interaction.channel}`, inline: true }
      ]
    });

    await interaction.editReply('Panel modération posté.');
  }
};
