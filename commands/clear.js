const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { writeDataStore } = require('../utils/discordDataStore');
const { sendModLog } = require('../utils/modLogs');

const CONFIRMATION_TEXT = 'RESET';

const EMPTY_STORES = {
  accounts: { users: {} },
  catalogue: { publicMessage: null, categories: [] },
  sellers: { publicMessage: null, applications: {}, sellers: {} },
  vouches: { panelMessage: null, vouches: {} },
  orders: { orders: {}, statsMessage: null }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Remet toute la data HEXA_HUB a zero.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('confirmation')
        .setDescription(`Tape ${CONFIRMATION_TEXT} pour confirmer la remise a zero totale.`)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const confirmation = interaction.options.getString('confirmation', true).trim();
    if (confirmation !== CONFIRMATION_TEXT) {
      await interaction.editReply(`Action annulee. Pour tout remettre a zero, tape exactement \`${CONFIRMATION_TEXT}\`.`);
      return;
    }

    for (const [storeName, emptyStore] of Object.entries(EMPTY_STORES)) {
      await writeDataStore(storeName, emptyStore);
    }

    await sendModLog(client, {
      type: 'moderation',
      title: '🧹 Data remise a zero',
      description: `${interaction.user} a remis toute la data HEXA_HUB a zero.`,
      fields: [
        { name: 'Data reset', value: Object.keys(EMPTY_STORES).join(', '), inline: false }
      ]
    });

    await interaction.editReply('Toute la data HEXA_HUB a ete remise a zero: comptes, catalogue, vouches et commandes.');
  }
};
