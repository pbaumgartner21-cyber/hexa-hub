const { Events } = require('discord.js');
const {
  handleAccountButton,
  handleAccountModalSubmit
} = require('../buttons/accounts');
const {
  handleCatalogueButton,
  handleCatalogueModalSubmit,
  handleCatalogueSelectMenu
} = require('../buttons/catalogue');
const {
  handleModerationButton,
  handleModerationModalSubmit
} = require('../buttons/moderation');
const {
  handleSupportButton,
  handleSupportSelectMenu
} = require('../buttons/support');
const {
  handleVouchButton,
  handleVouchSelectMenu,
  handleVouchModalSubmit
} = require('../buttons/vouches');
const { sendModLog } = require('../utils/modLogs');

const EPHEMERAL = 64;

function normalizeReplyPayload(payload, editing = false) {
  if (typeof payload === 'string') {
    return { content: payload };
  }

  const { ephemeral, flags, ...restPayload } = payload;

  if (!editing) {
    return ephemeral ? { ...restPayload, flags: flags || EPHEMERAL } : payload;
  }

  return restPayload;
}

async function safeInteractionReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(normalizeReplyPayload(payload, true));
    }

    return await interaction.reply(normalizeReplyPayload(payload, false));
  } catch (error) {
    console.warn('[INTERACTION] Impossible de repondre a une interaction:', error.message);
    return null;
  }
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction, client) {
    if (interaction.isButton()) {
      try {
        const handled =
          await handleAccountButton(interaction, client) ||
          await handleCatalogueButton(interaction, client) ||
          await handleModerationButton(interaction, client) ||
          await handleSupportButton(interaction, client) ||
          await handleVouchButton(interaction, client);

        if (!handled) {
          await safeInteractionReply(interaction, { content: 'Bouton inconnu.', ephemeral: true });
          await sendModLog(client, {
            title: '⚠️ Bouton inconnu',
            description: `${interaction.user} a utilisé un bouton inconnu.`,
            fields: [
              { name: 'Custom ID', value: interaction.customId, inline: false }
            ]
          });
        }
      } catch (error) {
        console.error(`[BOUTONS] Erreur avec ${interaction.customId}:`, error);

        const message = 'Une erreur est arrivee pendant l action du bouton.';
        await safeInteractionReply(interaction, { content: message, ephemeral: true });
        await sendModLog(client, {
          title: '❌ Erreur bouton',
          description: `${interaction.user} a déclenché une erreur bouton.`,
          fields: [
            { name: 'Custom ID', value: interaction.customId, inline: false },
            { name: 'Erreur', value: String(error.message || error).slice(0, 1000), inline: false }
          ]
        });
      }

      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        const handled =
          await handleCatalogueSelectMenu(interaction, client) ||
          await handleSupportSelectMenu(interaction, client) ||
          await handleVouchSelectMenu(interaction, client);

        if (!handled) {
          await safeInteractionReply(interaction, { content: 'Menu inconnu.', ephemeral: true });
          await sendModLog(client, {
            title: '⚠️ Menu inconnu',
            description: `${interaction.user} a utilisé un menu inconnu.`,
            fields: [
              { name: 'Custom ID', value: interaction.customId, inline: false }
            ]
          });
        }
      } catch (error) {
        console.error(`[MENUS] Erreur avec ${interaction.customId}:`, error);

        const message = 'Une erreur est arrivee pendant l action du menu.';
        await safeInteractionReply(interaction, { content: message, ephemeral: true });
        await sendModLog(client, {
          title: '❌ Erreur menu',
          description: `${interaction.user} a déclenché une erreur menu.`,
          fields: [
            { name: 'Custom ID', value: interaction.customId, inline: false },
            { name: 'Erreur', value: String(error.message || error).slice(0, 1000), inline: false }
          ]
        });
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        const handled =
          await handleAccountModalSubmit(interaction, client) ||
          await handleCatalogueModalSubmit(interaction, client) ||
          await handleModerationModalSubmit(interaction, client) ||
          await handleVouchModalSubmit(interaction, client);

        if (!handled) {
          await safeInteractionReply(interaction, { content: 'Formulaire inconnu.', ephemeral: true });
          await sendModLog(client, {
            title: '⚠️ Formulaire inconnu',
            description: `${interaction.user} a envoyé un formulaire inconnu.`,
            fields: [
              { name: 'Custom ID', value: interaction.customId, inline: false }
            ]
          });
        }
      } catch (error) {
        console.error(`[MODALS] Erreur avec ${interaction.customId}:`, error);

        const message = 'Une erreur est arrivee pendant l envoi du formulaire.';
        await safeInteractionReply(interaction, { content: message, ephemeral: true });
        await sendModLog(client, {
          title: '❌ Erreur formulaire',
          description: `${interaction.user} a déclenché une erreur formulaire.`,
          fields: [
            { name: 'Custom ID', value: interaction.customId, inline: false },
            { name: 'Erreur', value: String(error.message || error).slice(0, 1000), inline: false }
          ]
        });
      }

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
      await sendModLog(client, {
        title: '✅ Commande exécutée',
        description: `${interaction.user} a exécuté une commande.`,
        fields: [
          { name: 'Commande', value: `/${interaction.commandName}`, inline: true },
          { name: 'Salon', value: interaction.channel ? `${interaction.channel}` : 'inconnu', inline: true }
        ]
      });
    } catch (error) {
      console.error(`[COMMANDES] Erreur avec /${interaction.commandName}:`, error);

      const message = 'Une erreur est arrivee pendant l execution de la commande.';
      await safeInteractionReply(interaction, { content: message, ephemeral: true });
      await sendModLog(client, {
        title: '❌ Erreur commande',
        description: `${interaction.user} a déclenché une erreur commande.`,
        fields: [
          { name: 'Commande', value: `/${interaction.commandName}`, inline: true },
          { name: 'Erreur', value: String(error.message || error).slice(0, 1000), inline: false }
        ]
      });
    }
  }
};
