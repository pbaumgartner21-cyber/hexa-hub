const {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const { addBalance } = require('../services/accounts');
const {
  getOrder,
  getVouchableOrders,
  markOrderVouchApproved,
  markOrderVouchPending,
  markOrderVouchRejected,
  orderSummary
} = require('../services/orders');
const {
  approveVouch,
  createPendingVouch,
  getVouchStats,
  rejectVouch
} = require('../services/vouches');
const {
  buildVouchPanelMessage,
  buildVouchOrderSelectMessage,
  buildVouchPublicMessage,
  buildVouchVerifyMessage
} = require('../templates/embeds');
const { updateAccountPrivateChannel } = require('../utils/accountPrivate');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const VOUCH_MODAL_PREFIX = 'vouch:modal:';
const EPHEMERAL = 64;
const approvingVouches = new Set();

function createVouchModal(orderId) {
  return new ModalBuilder()
    .setCustomId(`${VOUCH_MODAL_PREFIX}${orderId}`)
    .setTitle('Poster un avis')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('rating')
          .setLabel('Note sur 5')
          .setPlaceholder('Exemple: 5')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Ton avis')
          .setPlaceholder('Décris ton achat et ton expérience.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

async function updateVouchPanel(client, panelMessage) {
  if (!panelMessage?.channelId || !panelMessage?.messageId) return;

  const channel = await fetchTextChannel(client, panelMessage.channelId);
  if (!channel) return;

  const message = await channel.messages.fetch(panelMessage.messageId).catch(() => null);
  if (!message) return;

  const stats = await getVouchStats();
  await message.edit(buildVouchPanelMessage(stats)).catch((error) => {
    console.warn('[VOUCH] Impossible de mettre a jour le panel:', error.message);
  });
}

function canModerate(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

async function handleVouchButton(interaction, client) {
  if (interaction.customId === 'vouch:open') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const orders = await getVouchableOrders(interaction.user.id);

    if (orders.length === 0) {
      await interaction.editReply('Tu dois avoir une commande sans avis pour poster un vouch.');
      await sendModLog(client, {
        type: 'shop',
        title: '⭐ Vouch refusé automatiquement',
        description: `${interaction.user} a tenté de poster un vouch sans commande disponible.`
      });
      return true;
    }

    await interaction.editReply(buildVouchOrderSelectMessage(orders));
    return true;
  }

  if (interaction.customId.startsWith('vouch:approve:')) {
    if (!canModerate(interaction)) {
      await interaction.reply({ content: 'Tu n as pas la permission de valider les vouches.', flags: EPHEMERAL });
      return true;
    }

    await interaction.deferUpdate();

    const vouchId = interaction.customId.slice('vouch:approve:'.length);
    if (approvingVouches.has(vouchId)) {
      await interaction.followUp({ content: 'Ce vouch est déjà en cours de validation.', flags: EPHEMERAL });
      return true;
    }

    approvingVouches.add(vouchId);
    try {
      const result = await approveVouch(vouchId, interaction.user.id);

      if (!result.found) {
        await interaction.followUp({ content: 'Vouch introuvable.', flags: EPHEMERAL });
        return true;
      }

      if (!result.changed) {
        await interaction.message.edit({ components: [] }).catch(() => null);
        await interaction.followUp({ content: 'Ce vouch a déjà été validé.', flags: EPHEMERAL });
        return true;
      }

      await addBalance(result.vouch.user, 0.05);
      await markOrderVouchApproved(result.vouch.order.id, result.vouch.id);
      await updateAccountPrivateChannel(client, result.vouch.user.id).catch((error) => {
        console.warn('[VOUCH] Impossible de mettre a jour le salon prive:', error.message);
      });

      const publicChannel = await fetchTextChannel(client, config.channels.vouchClient);
      if (publicChannel) {
        await sendBotMessage(publicChannel, buildVouchPublicMessage(result.vouch));
      }

      await updateVouchPanel(client, result.panelMessage);
      await interaction.message.edit({ components: [] }).catch(() => null);
      await sendModLog(client, {
        type: 'shop',
        title: '⭐ Vouch validé',
        description: `${interaction.user} a validé un vouch de <@${result.vouch.user.id}>.`,
        fields: [
          { name: 'Commande', value: result.vouch.order.id, inline: true },
          { name: 'Produit', value: result.vouch.order.productName, inline: true },
          { name: 'Note', value: `${result.vouch.rating}/5`, inline: true }
        ]
      });
      await interaction.followUp({ content: 'Vouch validé et posté.', flags: EPHEMERAL });
    } finally {
      approvingVouches.delete(vouchId);
    }
    return true;
  }

  if (interaction.customId.startsWith('vouch:reject:')) {
    if (!canModerate(interaction)) {
      await interaction.reply({ content: 'Tu n as pas la permission de refuser les vouches.', flags: EPHEMERAL });
      return true;
    }

    await interaction.deferUpdate();

    const vouchId = interaction.customId.slice('vouch:reject:'.length);
    const result = await rejectVouch(vouchId, interaction.user.id);

    if (!result.found) {
      await interaction.followUp({ content: 'Vouch introuvable.', flags: EPHEMERAL });
      return true;
    }

    await interaction.message.edit({ components: [] }).catch(() => null);
    await markOrderVouchRejected(result.vouch.order.id);
    await sendModLog(client, {
      type: 'shop',
      title: '⭐ Vouch refusé',
      description: `${interaction.user} a refusé un vouch de <@${result.vouch.user.id}>.`,
      fields: [
        { name: 'Commande', value: result.vouch.order.id, inline: true },
        { name: 'Produit', value: result.vouch.order.productName, inline: true },
        { name: 'Note', value: `${result.vouch.rating}/5`, inline: true }
      ]
    });
    await interaction.followUp({ content: 'Vouch refusé.', flags: EPHEMERAL });
    return true;
  }

  return false;
}

async function handleVouchSelectMenu(interaction) {
  if (interaction.customId !== 'vouch:select-order') {
    return false;
  }

  const orderId = interaction.values[0];
  await interaction.showModal(createVouchModal(orderId));
  return true;
}

async function handleVouchModalSubmit(interaction, client) {
  if (!interaction.customId.startsWith(VOUCH_MODAL_PREFIX)) {
    return false;
  }

  await interaction.deferReply({ flags: EPHEMERAL });

  try {
    const orderId = interaction.customId.slice(VOUCH_MODAL_PREFIX.length);
    const order = await getOrder(orderId);

    if (!order || order.user.id !== interaction.user.id || order.vouchId) {
      await interaction.editReply('Commande introuvable ou déjà utilisée pour un vouch.');
      return true;
    }

    const verifyChannel = await fetchTextChannel(client, config.channels.vouchVerify);
    if (!verifyChannel) {
      await interaction.editReply('Le salon de vérification est introuvable. Ton avis n a pas été enregistré.');
      return true;
    }

    const vouch = await createPendingVouch({
      user: interaction.user,
      member: interaction.member,
      order: orderSummary(order),
      rating: interaction.fields.getTextInputValue('rating'),
      description: interaction.fields.getTextInputValue('description')
    });
    await markOrderVouchPending(order.id, vouch.id);

    await sendBotMessage(verifyChannel, buildVouchVerifyMessage(vouch));
    await sendModLog(client, {
      type: 'shop',
      title: '⭐ Vouch envoyé',
      description: `${interaction.user} a envoyé un vouch en attente de validation.`,
      fields: [
        { name: 'Commande', value: order.id, inline: true },
        { name: 'Produit', value: order.productName, inline: true },
        { name: 'Note', value: `${vouch.rating}/5`, inline: true },
        { name: 'Salon vérification', value: `${verifyChannel}`, inline: true }
      ]
    });
    await interaction.editReply('Merci pour ton avis. Il est en attente de validation par le staff.');
  } catch (error) {
    await interaction.editReply(`Avis non envoyé: ${error.message}`);
  }

  return true;
}

module.exports = {
  handleVouchButton,
  handleVouchSelectMenu,
  handleVouchModalSubmit
};
