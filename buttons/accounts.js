const {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const { createAccountWithCredentials, loginAccount } = require('../services/accounts');
const { getCatalogue, findProduct } = require('../services/catalogue');
const {
  getOrder,
  getOrderStats,
  markOrderClaimed,
  markOrderDelivered,
  saveStatsMessage
} = require('../services/orders');
const {
  buildAccountCreatedAdminMessage,
  buildDeliveryMessage,
  buildOrderClaimTicketMessage,
  buildRevenueStatsMessage
} = require('../templates/embeds');
const { createSupportTicket } = require('./support');
const { ensureAccountPrivateChannel } = require('../utils/accountPrivate');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const ACCOUNT_CREATE_BUTTON_ID = 'accounts:create';
const ACCOUNT_CREATE_MODAL_ID = 'accounts:create-modal';
const ACCOUNT_LOGIN_BUTTON_ID = 'accounts:login';
const ACCOUNT_ADD_BALANCE_BUTTON_ID = 'accounts:add-balance-ticket';
const ACCOUNT_CLAIM_ORDER_BUTTON_ID = 'accounts:claim-order';
const ACCOUNT_CLAIM_ORDER_MODAL_ID = 'accounts:claim-order-modal';
const ORDER_DELIVER_BUTTON_PREFIX = 'orders:deliver:';
const ORDER_DELIVER_MODAL_PREFIX = 'orders:deliver-modal:';
const EPHEMERAL = 64;

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

function canManageOrders(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.member?.roles?.cache?.has(config.staffRoleId);
}

function createClaimOrderModal() {
  return new ModalBuilder()
    .setCustomId(ACCOUNT_CLAIM_ORDER_MODAL_ID)
    .setTitle('Réclamer ma commande')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('orderId')
          .setLabel('ID de commande')
          .setPlaceholder('HH-MPLATELK-89ZK')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createAccountCredentialsModal() {
  return new ModalBuilder()
    .setCustomId(ACCOUNT_CREATE_MODAL_ID)
    .setTitle('Créer mon compte HEXA_HUB')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('email')
          .setLabel('Email de connexion')
          .setPlaceholder('exemple@mail.com')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('password')
          .setLabel('Mot de passe')
          .setPlaceholder('Minimum 8 caractères')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function createDeliveryModal(order) {
  const orderId = typeof order === 'string' ? order : order.id;
  const itemNames = Array.isArray(order.items) && order.items.length > 0
    ? order.items.map((item) => item.productName).join(', ')
    : order.productName || '';
  const quantity = order.quantity || (Array.isArray(order.items)
    ? order.items.reduce((total, item) => total + Number(item.quantity || 1), 0)
    : 1);

  return new ModalBuilder()
    .setCustomId(`${ORDER_DELIVER_MODAL_PREFIX}${orderId}`)
    .setTitle('Livrer la commande')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('orderId')
          .setLabel('ID de commande')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(orderId)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('productType')
          .setLabel('Comptes de quoi / service')
          .setPlaceholder('Exemple: Crunchyroll, ADN, Snapchat+')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(itemNames.slice(0, 100) || 'Compte')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Combien de comptes / codes')
          .setPlaceholder('Exemple: 20')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(quantity))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('deliveryContent')
          .setLabel('Comptes, liens, codes à envoyer')
          .setPlaceholder('Un compte par ligne, ou les liens/codes à livrer.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('requestMessage')
          .setLabel('Demande spéciale au client')
          .setPlaceholder('Ex: J’aurais besoin de votre mot de passe pour augmenter votre score Snap.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
}

async function getOrderProduct(order) {
  const store = await getCatalogue();
  const result = findProduct(store, order.productId);

  return {
    product: result?.product || null,
    category: result?.category || null
  };
}

async function createClaimTicket(interaction, order, product, category) {
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

  const channel = await interaction.guild.channels.create({
    name: `commande-${sanitizeChannelName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: config.channels.supportCategory,
    permissionOverwrites
  });

  await sendBotMessage(channel, {
    content: staffRole ? `${staffRole}` : 'Staff',
    ...buildOrderClaimTicketMessage(interaction.user, order, product, category)
  });
  await markOrderClaimed(order.id, channel.id);

  return channel;
}

async function updateRevenueStats(client) {
  const channel = await fetchTextChannel(client, config.channels.resultat);
  if (!channel) return;

  const stats = await getOrderStats();
  let message = null;

  if (stats.statsMessage?.channelId && stats.statsMessage?.messageId) {
    const statsChannel = await fetchTextChannel(client, stats.statsMessage.channelId);
    if (statsChannel) {
      message = await statsChannel.messages.fetch(stats.statsMessage.messageId).catch(() => null);
    }
  }

  if (message) {
    await message.edit(buildRevenueStatsMessage(stats)).catch(() => null);
    return;
  }

  message = await sendBotMessage(channel, buildRevenueStatsMessage(stats));
  await saveStatsMessage(channel.id, message.id);
}

async function handleCreateAccount(interaction, client) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const result = await createAccountWithCredentials(
    interaction.user,
    interaction.member,
    interaction.fields.getTextInputValue('email'),
    interaction.fields.getTextInputValue('password')
  );
  const privateChannel = await ensureAccountPrivateChannel(client, interaction.guild, interaction.user, result.account)
    .catch((error) => {
      console.warn('[COMPTES] Impossible de creer/mettre a jour le salon prive:', error.message);
      return null;
    });

  if (!result.created) {
    await interaction.editReply([
      'Ton compte HEXA_HUB existe déjà. Email et mot de passe de connexion mis à jour.',
      privateChannel ? `Ton salon prive: ${privateChannel}` : null
    ].filter(Boolean).join('\n'));
    return;
  }

  await interaction.editReply([
    'Ton compte HEXA_HUB est créé. Tu peux maintenant te connecter sur Discord et sur le site.',
    privateChannel ? `Ton salon prive: ${privateChannel}` : null
  ].filter(Boolean).join('\n'));

  const adminChannel = await fetchTextChannel(client, config.channels.accountLogs);
  if (!adminChannel) {
    console.warn('[COMPTES] Salon admin introuvable. Verifie ACCOUNT_LOGS_CHANNEL_ID dans .env.');
    return;
  }

  await sendBotMessage(
    adminChannel,
    buildAccountCreatedAdminMessage(interaction.user, interaction.member, result.account, result.totalAccounts)
  );
  await sendModLog(client, {
    type: 'shop',
    title: '🙋 Compte créé',
    description: `${interaction.user} a créé un compte HEXA_HUB.`,
    fields: [
      { name: 'Total comptes', value: String(result.totalAccounts), inline: true }
    ]
  });
}

async function handleLoginAccount(interaction, client) {
  await interaction.deferReply({ flags: EPHEMERAL });

  const result = await loginAccount(interaction.user);

  if (!result.exists) {
    await interaction.editReply('Tu n as pas encore de compte HEXA_HUB. Clique sur **Creer un compte** pour commencer.');
    return;
  }

  const balance = Number(result.account.balance || 0).toFixed(2);
  const privateChannel = await ensureAccountPrivateChannel(client, interaction.guild, interaction.user, result.account)
    .catch((error) => {
      console.warn('[COMPTES] Impossible de mettre a jour le salon prive:', error.message);
      return null;
    });

  await interaction.editReply([
    `Connexion reussie. Ton compte HEXA_HUB est actif. Solde: **${balance}€**.`,
    privateChannel ? `Ton salon prive: ${privateChannel}` : null
  ].filter(Boolean).join('\n'));
  await sendModLog(client, {
    type: 'shop',
    title: '🔐 Connexion compte',
    description: `${interaction.user} s’est connecté à son compte HEXA_HUB.`,
    fields: [
      { name: 'Solde', value: `${balance}€`, inline: true }
    ]
  });
}

async function handleAccountButton(interaction, client) {
  if (interaction.customId === ACCOUNT_CREATE_BUTTON_ID) {
    await interaction.showModal(createAccountCredentialsModal());
    return true;
  }

  if (interaction.customId === ACCOUNT_LOGIN_BUTTON_ID) {
    await handleLoginAccount(interaction, client);
    return true;
  }

  if (interaction.customId === ACCOUNT_ADD_BALANCE_BUTTON_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });
    await createSupportTicket(interaction, 'solde', { channelPrefix: 'solde' });
    return true;
  }

  if (interaction.customId === ACCOUNT_CLAIM_ORDER_BUTTON_ID) {
    await interaction.showModal(createClaimOrderModal());
    return true;
  }

  if (interaction.customId.startsWith(ORDER_DELIVER_BUTTON_PREFIX)) {
    if (!canManageOrders(interaction)) {
      await interaction.reply({
        content: 'Seul le staff peut livrer une commande.',
        flags: EPHEMERAL
      });
      return true;
    }

    const orderId = interaction.customId.slice(ORDER_DELIVER_BUTTON_PREFIX.length);
    const order = await getOrder(orderId);
    if (!order) {
      await interaction.reply({
        content: 'Commande introuvable.',
        flags: EPHEMERAL
      });
      return true;
    }

    await interaction.showModal(createDeliveryModal(order));
    return true;
  }

  return false;
}

async function handleAccountModalSubmit(interaction, client) {
  if (interaction.customId === ACCOUNT_CREATE_MODAL_ID) {
    try {
      await handleCreateAccount(interaction, client);
    } catch (error) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: `Compte non créé: ${error.message}`, flags: EPHEMERAL });
      } else {
        await interaction.editReply(`Compte non créé: ${error.message}`);
      }
    }

    return true;
  }

  if (interaction.customId === ACCOUNT_CLAIM_ORDER_MODAL_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const orderId = interaction.fields.getTextInputValue('orderId').trim();
    const order = await getOrder(orderId);

    if (!order) {
      await interaction.editReply('Commande introuvable. Vérifie l’ID puis réessaie.');
      return true;
    }

    if (order.user.id !== interaction.user.id) {
      await interaction.editReply('Cette commande n’appartient pas à ton compte.');
      return true;
    }

    if (!interaction.guild) {
      await interaction.editReply('Tu dois réclamer ta commande dans le serveur.');
      return true;
    }

    const { product, category } = await getOrderProduct(order);
    const channel = await createClaimTicket(interaction, order, product, category);

    await interaction.editReply(`Ticket de réclamation ouvert: ${channel}`);
    await sendModLog(client, {
      type: 'ticket',
      title: '📦 Commande réclamée',
      description: `${interaction.user} a réclamé une commande.`,
      fields: [
        { name: 'Commande', value: order.id, inline: true },
        { name: 'Produit', value: order.productName, inline: true },
        { name: 'Ticket', value: `${channel}`, inline: true }
      ]
    });
    return true;
  }

  if (interaction.customId.startsWith(ORDER_DELIVER_MODAL_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });

    if (!canManageOrders(interaction)) {
      await interaction.editReply('Seul le staff peut livrer une commande.');
      return true;
    }

    const fallbackOrderId = interaction.customId.slice(ORDER_DELIVER_MODAL_PREFIX.length);
    const orderId = interaction.fields.getTextInputValue('orderId').trim() || fallbackOrderId;
    const productType = interaction.fields.getTextInputValue('productType').trim();
    const quantity = interaction.fields.getTextInputValue('quantity').trim();
    const deliveryContent = interaction.fields.getTextInputValue('deliveryContent').trim();
    const requestMessage = interaction.fields.getTextInputValue('requestMessage').trim();
    const order = await getOrder(orderId);

    if (!order) {
      await interaction.editReply('Commande introuvable.');
      return true;
    }

    const { product } = await getOrderProduct(order);
    const payload = buildDeliveryMessage(order, product, {
      productType,
      deliveryType: productType,
      quantity,
      deliveryContent,
      requestMessage
    });
    const isInfoRequest = !deliveryContent && Boolean(requestMessage);

    await interaction.channel.send({
      content: `<@${order.user.id}>`,
      ...payload
    });

    const user = await client.users.fetch(order.user.id).catch(() => null);
    if (user) {
      await user.send(payload).catch(() => null);
    }

    if (!isInfoRequest) {
      await markOrderDelivered(order.id, interaction.user.id);
      await updateRevenueStats(client).catch((error) => {
        console.warn('[RESULTATS] Impossible de mettre a jour les resultats:', error.message);
      });
      await interaction.message?.edit({ components: [] }).catch(() => null);
    }

    await interaction.editReply(isInfoRequest
      ? `Demande envoyée pour la commande \`${order.id}\`.`
      : `Commande \`${order.id}\` livrée.`);
    await sendModLog(client, {
      type: 'shop',
      title: isInfoRequest ? '📩 Information demandée' : '✅ Commande livrée',
      description: isInfoRequest
        ? `${interaction.user} a demandé une information pour une commande.`
        : `${interaction.user} a livré une commande.`,
      fields: [
        { name: 'Commande', value: order.id, inline: true },
        { name: 'Client', value: `<@${order.user.id}>`, inline: true },
        { name: 'Produit', value: productType || order.productName, inline: true }
      ]
    });
    return true;
  }

  return false;
}

module.exports = {
  ACCOUNT_ADD_BALANCE_BUTTON_ID,
  ACCOUNT_CLAIM_ORDER_BUTTON_ID,
  ACCOUNT_CREATE_BUTTON_ID,
  ACCOUNT_CREATE_MODAL_ID,
  ACCOUNT_LOGIN_BUTTON_ID,
  handleAccountButton,
  handleAccountModalSubmit
};
