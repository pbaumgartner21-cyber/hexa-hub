const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildSupportPanelMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Poste le panel support HEXA_HUB.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = config.channels.supportPanel
      ? await fetchTextChannel(client, config.channels.supportPanel)
      : interaction.channel;

    if (!channel || !channel.isTextBased()) {
      await interaction.editReply('Impossible de trouver le salon support.');
      return;
    }

    await sendBotMessage(channel, buildSupportPanelMessage());
    await sendModLog(client, {
      type: 'ticket',
      title: '🎟️ Panel support posté',
      description: `${interaction.user} a posté le panel support.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });
    await interaction.editReply(`Panel support poste dans ${channel}.`);
  }
};
