const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { addBalance } = require('../services/accounts');
const { ensureAccountPrivateChannel } = require('../utils/accountPrivate');
const { sendModLog } = require('../utils/modLogs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('argent')
    .setDescription('Ajoute de l argent au solde HEXA_HUB d un membre.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option
        .setName('membre')
        .setDescription('Membre à créditer.')
        .setRequired(true)
    )
    .addNumberOption((option) =>
      option
        .setName('montant')
        .setDescription('Montant à ajouter en euros.')
        .setRequired(true)
        .setMinValue(0.01)
    )
    .addStringOption((option) =>
      option
        .setName('raison')
        .setDescription('Raison de l ajout.')
        .setRequired(false)
        .setMaxLength(500)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    const user = interaction.options.getUser('membre', true);
    const amount = interaction.options.getNumber('montant', true);
    const reason = interaction.options.getString('raison') || 'Aucune raison indiquée.';
    const account = await addBalance(user, amount);
    await ensureAccountPrivateChannel(client, interaction.guild, user, account).catch((error) => {
      console.warn('[ARGENT] Impossible de mettre a jour le salon prive:', error.message);
    });

    await sendModLog(client, {
      type: 'shop',
      title: '💰 Solde crédité',
      description: `${interaction.user} a ajouté de l’argent au solde de ${user}.`,
      fields: [
        { name: 'Montant', value: `+${amount.toFixed(2)}€`, inline: true },
        { name: 'Nouveau solde', value: `${Number(account.balance || 0).toFixed(2)}€`, inline: true },
        { name: 'Raison', value: reason, inline: false }
      ]
    });

    await interaction.editReply(`${user} a reçu **+${amount.toFixed(2)}€**. Nouveau solde: **${Number(account.balance || 0).toFixed(2)}€**.`);
  }
};
