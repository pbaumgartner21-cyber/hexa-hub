const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { buildSupportTicketMessage } = require('../templates/embeds');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const EPHEMERAL = 64;

const SUPPORT_TYPES = {
  solde: 'solde',
  achat: 'achat',
  commande: 'commande',
  bug: 'bug',
  produit: 'produit',
  autre: 'autre'
};

function sanitizeChannelName(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'membre';
}

function findStaffRole(guild) {
  if (config.staffRoleId) {
    const role = guild.roles.cache.get(config.staffRoleId);
    if (role) return role;
  }

  return guild.roles.cache.find((role) => role.name.toLowerCase() === 'staff') || null;
}

function canManageTicket(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  if (!config.staffRoleId) {
    return false;
  }

  return interaction.member?.roles?.cache?.has(config.staffRoleId);
}

async function createSupportTicket(interaction, supportType, options = {}) {
  if (!interaction.guild) {
    await interaction.editReply('Les tickets doivent être ouverts dans un serveur.');
    return null;
  }

  const resolvedSupportType = SUPPORT_TYPES[supportType] || SUPPORT_TYPES.autre;
  const channelPrefix = options.channelPrefix || 'ticket';
  const channelName = `${channelPrefix}-${sanitizeChannelName(interaction.user.username)}`;
  const staffRole = findStaffRole(interaction.guild);
  const permissionOverwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (staffRole) {
    permissionOverwrites.push({
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.channels.supportCategory,
    permissionOverwrites
  });

  await sendBotMessage(ticketChannel, {
    content: staffRole ? `${staffRole}` : 'Staff',
    ...buildSupportTicketMessage(interaction.user, resolvedSupportType)
  });
  await interaction.editReply(`Ticket ouvert: ${ticketChannel}`);
  await sendModLog(interaction.client, {
    type: 'ticket',
    title: '🎟️ Ticket support ouvert',
    description: `${interaction.user} a ouvert un ticket ${ticketChannel}.`,
    fields: [
      { name: 'Type', value: resolvedSupportType, inline: true },
      { name: 'Salon', value: `${ticketChannel}`, inline: true }
    ]
  });

  return ticketChannel;
}

async function handleSupportSelectMenu(interaction) {
  if (interaction.customId !== 'support:open') {
    return false;
  }

  await interaction.deferReply({ flags: EPHEMERAL });
  await createSupportTicket(interaction, interaction.values[0]);
  return true;
}

async function handleSupportButton(interaction) {
  if (interaction.customId !== 'support:close') {
    return false;
  }

  if (!canManageTicket(interaction)) {
    await interaction.reply({
      content: 'Seul le staff peut fermer un ticket.',
      flags: EPHEMERAL
    });
    return true;
  }

  const channel = interaction.channel;
  await interaction.reply({
    content: 'Ticket fermé. Suppression du salon dans 5 secondes.',
    flags: EPHEMERAL
  });

  await sendModLog(interaction.client, {
    type: 'ticket',
    title: '🔒 Ticket support fermé',
    description: `${interaction.user} a fermé un ticket support.`,
    fields: [
      { name: 'Salon', value: `${channel}`, inline: true },
      { name: 'Nom', value: channel?.name || 'inconnu', inline: true }
    ]
  });

  setTimeout(() => {
    channel?.delete('Ticket support fermé par le staff').catch((error) => {
      console.warn('[SUPPORT] Impossible de supprimer le ticket:', error.message);
    });
  }, 5000);

  return true;
}

module.exports = {
  createSupportTicket,
  handleSupportButton,
  handleSupportSelectMenu
};
