const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { buildBecomeSellerMessage } = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('devenir-seller')
    .setDescription('Poste le panel pour demander a devenir seller.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const channel = await fetchTextChannel(client, config.channels.devenirSeller) || interaction.channel;
    await sendBotMessage(channel, buildBecomeSellerMessage());
    await sendModLog(client, {
      type: 'shop',
      title: '🛍️ Panel devenir seller posté',
      description: `${interaction.user} a posté le panel devenir seller.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true }
      ]
    });

    await interaction.editReply(`Panel devenir seller posté dans ${channel}.`);
  }
};
