const {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const { deleteAccount, setShopBlocked } = require('../services/accounts');
const { updateAccountPrivateChannel } = require('../utils/accountPrivate');
const { sendModLog } = require('../utils/modLogs');

const EPHEMERAL = 64;

const ACTIONS = {
  ban: { label: 'Ban', title: '🔨 Ban membre', needsDuration: false },
  unban: { label: 'Unban', title: '✅ Unban membre', needsDuration: false },
  kick: { label: 'Kick', title: '👢 Kick membre', needsDuration: false },
  warn: { label: 'Avertir', title: '⚠️ Avertir membre', needsDuration: false },
  mute: { label: 'Mute', title: '🔇 Mute membre', needsDuration: true },
  unmute: { label: 'Unmute', title: '🔊 Unmute membre', needsDuration: false },
  'shop-block': { label: 'Bloquer boutique', title: '🚫 Bloquer boutique', needsDuration: false },
  'shop-unblock': { label: 'Débloquer boutique', title: '✅ Débloquer boutique', needsDuration: false },
  'delete-account': { label: 'Supprimer compte', title: '🗑️ Supprimer compte', needsDuration: false }
};

function canModerate(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.member?.roles?.cache?.has(config.staffRoleId);
}

function createInput(customId, label, style, required = true, placeholder = '') {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setPlaceholder(placeholder);
}

function createModerationModal(action) {
  const actionConfig = ACTIONS[action];
  const modal = new ModalBuilder()
    .setCustomId(`moderation:modal:${action}`)
    .setTitle(actionConfig.title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        createInput('userId', 'ID Discord du membre', TextInputStyle.Short, true, '123456789012345678')
      ),
      new ActionRowBuilder().addComponents(
        createInput('reason', 'Raison', TextInputStyle.Paragraph, false, 'Raison de l action')
      )
    );

  if (actionConfig.needsDuration) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        createInput('duration', 'Durée en minutes', TextInputStyle.Short, true, '60')
      )
    );
  }

  return modal;
}

async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function handleModerationButton(interaction) {
  if (!interaction.customId.startsWith('moderation:')) {
    return false;
  }

  const action = interaction.customId.slice('moderation:'.length);
  if (!ACTIONS[action]) {
    return false;
  }

  if (!canModerate(interaction)) {
    await interaction.reply({ content: 'Tu n as pas la permission d utiliser ce panel.', flags: EPHEMERAL });
    return true;
  }

  await interaction.showModal(createModerationModal(action));
  return true;
}

async function handleModerationModalSubmit(interaction) {
  if (!interaction.customId.startsWith('moderation:modal:')) {
    return false;
  }

  if (!canModerate(interaction)) {
    await interaction.reply({ content: 'Tu n as pas la permission d utiliser ce panel.', flags: EPHEMERAL });
    return true;
  }

  await interaction.deferReply({ flags: EPHEMERAL });

  const action = interaction.customId.slice('moderation:modal:'.length);
  const actionConfig = ACTIONS[action];
  const userId = interaction.fields.getTextInputValue('userId').trim();
  const reason = interaction.fields.getTextInputValue('reason') || 'Aucune raison indiquée.';
  let resultText = '';

  try {
    if (action === 'ban') {
      await interaction.guild.members.ban(userId, { reason });
      resultText = `Membre \`${userId}\` banni.`;
    } else if (action === 'unban') {
      await interaction.guild.members.unban(userId, reason);
      resultText = `Membre \`${userId}\` débanni.`;
    } else if (action === 'kick') {
      const member = await fetchMember(interaction.guild, userId);
      if (!member) throw new Error('Membre introuvable.');
      await member.kick(reason);
      resultText = `${member} a été kick.`;
    } else if (action === 'mute') {
      const member = await fetchMember(interaction.guild, userId);
      if (!member) throw new Error('Membre introuvable.');
      if (!member.moderatable) throw new Error('Je ne peux pas mettre ce membre en sourdine.');
      const duration = Number.parseInt(interaction.fields.getTextInputValue('duration'), 10);
      if (Number.isNaN(duration) || duration <= 0) throw new Error('Durée invalide.');
      await member.disableCommunicationUntil(Date.now() + duration * 60 * 1000, reason);
      resultText = `${member} mis en sourdine pendant ${duration} minute(s).`;
    } else if (action === 'unmute') {
      const member = await fetchMember(interaction.guild, userId);
      if (!member) throw new Error('Membre introuvable.');
      if (!member.moderatable) throw new Error('Je ne peux pas retirer la sourdine de ce membre.');
      await member.disableCommunicationUntil(null, reason);
      resultText = `Sourdine retirée pour ${member}.`;
    } else if (action === 'warn') {
      const member = await fetchMember(interaction.guild, userId);
      if (!member) throw new Error('Membre introuvable.');
      await member.send(`⚠️ Avertissement HEXA_HUB\nRaison: ${reason}`).catch(() => null);
      resultText = `${member} averti.`;
    } else if (action === 'shop-block') {
      await setShopBlocked(userId, true, reason);
      await updateAccountPrivateChannel(interaction.client, userId).catch((error) => {
        console.warn('[MODERATION] Impossible de mettre a jour le salon prive:', error.message);
      });
      resultText = `Membre \`${userId}\` bloqué de la boutique.`;
    } else if (action === 'shop-unblock') {
      await setShopBlocked(userId, false, reason);
      await updateAccountPrivateChannel(interaction.client, userId).catch((error) => {
        console.warn('[MODERATION] Impossible de mettre a jour le salon prive:', error.message);
      });
      resultText = `Membre \`${userId}\` débloqué de la boutique.`;
    } else if (action === 'delete-account') {
      const result = await deleteAccount(userId);
      resultText = result.deleted
        ? `Compte HEXA_HUB de \`${userId}\` supprimé.`
        : `Aucun compte HEXA_HUB trouvé pour \`${userId}\`.`;
    }

    await sendModLog(interaction.client, {
      type: action.startsWith('shop') || action === 'delete-account' ? 'shop' : 'moderation',
      title: `🛡️ ${actionConfig.label}`,
      description: `${interaction.user} a exécuté une action de modération.`,
      fields: [
        { name: 'Cible', value: userId, inline: true },
        { name: 'Action', value: actionConfig.label, inline: true },
        { name: 'Raison', value: reason, inline: false }
      ]
    });

    await interaction.editReply(resultText);
  } catch (error) {
    await sendModLog(interaction.client, {
      type: 'moderation',
      title: '❌ Action modération échouée',
      description: `${interaction.user} a tenté une action qui a échoué.`,
      fields: [
        { name: 'Action', value: actionConfig.label, inline: true },
        { name: 'Cible', value: userId, inline: true },
        { name: 'Erreur', value: String(error.message || error).slice(0, 1000), inline: false }
      ]
    });
    await interaction.editReply(`Action impossible: ${error.message}`);
  }

  return true;
}

module.exports = {
  handleModerationButton,
  handleModerationModalSubmit
};
