const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getAccount, setAccountPrivateMessage } = require('../services/accounts');
const { getOrdersForUser } = require('../services/orders');
const { buildAccountPrivateMessage } = require('../templates/embeds');
const { sendModLog } = require('./modLogs');
const { sendBotMessage } = require('./messages');

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

function getGuild(client, guild) {
  if (guild) return guild;
  if (config.guildId) return client.guilds.cache.get(config.guildId) || null;
  return client.guilds.cache.first() || null;
}

async function fetchAccountChannel(client, channelId) {
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function createAccountChannel(client, guild, user) {
  const staffRole = findStaffRole(guild);
  const parent = await guild.channels.fetch(config.channels.accountPrivateCategory).catch(() => null);
  const parentId = parent?.type === ChannelType.GuildCategory ? parent.id : null;
  const channelName = `compte-${sanitizeChannelName(user.username || user.id)}`;
  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
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

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites
  });
}

async function ensureAccountPrivateChannel(client, guild, user, account) {
  const targetGuild = getGuild(client, guild);
  if (!targetGuild || !user || !account) {
    return null;
  }

  let channel = await fetchAccountChannel(client, account.privateChannelId);

  if (!channel) {
    channel = await createAccountChannel(client, targetGuild, user);
    await sendModLog(client, {
      type: 'shop',
      title: '🙋 Salon compte créé',
      description: `Salon privé créé pour ${user}.`,
      fields: [
        { name: 'Salon', value: `${channel}`, inline: true },
        { name: 'Membre', value: `${user}`, inline: true }
      ]
    });
  }

  const orders = await getOrdersForUser(account.userId, 5);
  const payload = buildAccountPrivateMessage(user, account, orders);
  let message = account.privateMessageId
    ? await channel.messages.fetch(account.privateMessageId).catch(() => null)
    : null;

  if (message) {
    await message.edit(payload);
  } else {
    message = await sendBotMessage(channel, payload);
  }

  await setAccountPrivateMessage(account.userId, channel.id, message.id);
  return channel;
}

async function updateAccountPrivateChannel(client, userId) {
  const account = await getAccount(userId);
  if (!account?.privateChannelId) {
    return null;
  }

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    return null;
  }

  return ensureAccountPrivateChannel(client, null, user, account);
}

module.exports = {
  ensureAccountPrivateChannel,
  updateAccountPrivateChannel
};
