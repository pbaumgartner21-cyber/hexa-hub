const {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const {
  addSellerProduct,
  adjustSellerProductStock,
  createSellerApplication,
  ensureSellerProfile,
  getPublicSellerCategories,
  getSeller,
  readStore,
  reviewSellerApplication,
  reviewSellerProducts,
  saveSellerPublicMessage,
  submitSellerProducts,
  updateSellerCategory,
  updateSellerProduct,
  upsertSellerFromApplication
} = require('../services/sellers');
const {
  buildBecomeSellerMessage,
  buildSellerApplicationReviewMessage,
  buildSellerCatalogueCategoryMessage,
  buildSellerCataloguePublicMessage,
  buildSellerOwnCatalogueMessage,
  buildSellerPanelMessage,
  buildSellerProductSelectMessage,
  buildSellerSubmissionReviewMessage
} = require('../templates/embeds');
const { fetchTextChannel } = require('../utils/channels');
const { updateAccountPrivateChannel } = require('../utils/accountPrivate');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const EPHEMERAL = 64;
const MODAL_SELLER_APPLICATION_ID = 'seller:modal:application';
const MODAL_SELLER_ADD_PRODUCT_ID = 'seller:modal:add-product';
const MODAL_SELLER_EDIT_PRODUCT_PREFIX = 'seller:modal:edit-product:';
const MODAL_SELLER_STOCK_PREFIX = 'seller:modal:stock:';
const MODAL_SELLER_CATEGORY_ID = 'seller:modal:category';

function createTextInput(customId, label, style, required = true, placeholder = '', value = '') {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setPlaceholder(placeholder);

  if (value) input.setValue(String(value).slice(0, style === TextInputStyle.Paragraph ? 4000 : 100));
  return input;
}

function isStaff(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.member?.roles?.cache?.has(config.staffRoleId);
}

function sellerAccess(interaction) {
  const isPremium = interaction.member?.roles?.cache?.has(config.sellerPremiumRoleId);
  const isSeller = isPremium || interaction.member?.roles?.cache?.has(config.sellerRoleId);

  return { isSeller: Boolean(isSeller), isPremium: Boolean(isPremium) };
}

async function getOrCreateSellerForInteraction(interaction) {
  const access = sellerAccess(interaction);
  if (!access.isSeller) return { access, seller: null };

  const tier = access.isPremium ? 'premium' : 'standard';
  const result = await ensureSellerProfile(interaction.user, interaction.member, tier);
  return { access, seller: result.seller };
}

function createApplicationModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_SELLER_APPLICATION_ID)
    .setTitle('Devenir seller HEXA_HUB')
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('plan', 'Formule: simple ou premium', TextInputStyle.Short, true, 'simple / premium')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('shopName', 'Nom boutique / pseudo vendeur', TextInputStyle.Short, true, 'Exemple: Store de Alex')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('products', 'Produits que tu veux vendre', TextInputStyle.Paragraph, true, 'Liste les produits, prix approximatifs, stock...')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('experience', 'Infos, garanties, expérience', TextInputStyle.Paragraph, true, 'Explique pourquoi on peut te faire confiance.')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('contact', 'Contact paiement / disponibilité', TextInputStyle.Short, true, 'Discord, horaires, moyen de contact')
      )
    );
}

function createSellerProductModal(customId, product = null) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(product ? 'Modifier produit seller' : 'Ajouter produit seller')
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom du produit', TextInputStyle.Short, true, 'Exemple: Snap flammes 100 jours', product?.name || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('price', 'Prix', TextInputStyle.Short, true, 'Exemple: 4.99€', product?.price || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('stock', 'Stock', TextInputStyle.Short, true, 'Exemple: 10', product ? String(product.stock || 0) : '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('imageUrl', 'Lien image produit', TextInputStyle.Short, false, 'https://...', product?.imageUrl || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Détails du produit.', product?.description || '')
      )
    );
}

function createSellerStockModal(product) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_SELLER_STOCK_PREFIX}${product.id}`)
    .setTitle(`Stock: ${product.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('variation', 'Variation du stock (+ ou -)', TextInputStyle.Short, true, 'Exemple: 10 ou -3')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('note', 'Note optionnelle', TextInputStyle.Paragraph, false, 'Exemple: restock', `Stock actuel: ${product.stock || 0}`)
      )
    );
}

function createSellerCategoryModal(seller) {
  const category = seller.category || {};
  return new ModalBuilder()
    .setCustomId(MODAL_SELLER_CATEGORY_ID)
    .setTitle('Catégorie premium')
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom de ta catégorie', TextInputStyle.Short, true, 'Exemple: Premium Streaming', category.name || seller.shopName || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('emoji', 'Emoji', TextInputStyle.Short, false, 'Exemple: 💎', category.emoji || '💎')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Description de ta catégorie.', category.description || '')
      )
    );
}

async function updateSellerPublicMessage(client) {
  const store = await readStore();
  const categories = getPublicSellerCategories(store);
  const payload = buildSellerCataloguePublicMessage({ categories });
  const saved = store.publicMessage;
  const channel = saved?.channelId
    ? await fetchTextChannel(client, saved.channelId)
    : await fetchTextChannel(client, config.channels.sellerCatalogue);

  if (!channel) return null;

  let message = saved?.messageId
    ? await channel.messages.fetch(saved.messageId).catch(() => null)
    : null;

  if (message) {
    await message.edit(payload);
  } else {
    message = await sendBotMessage(channel, payload);
  }

  await saveSellerPublicMessage(channel.id, message.id);
  return message;
}

async function sendSellerReview(client, payload) {
  const channel = await fetchTextChannel(client, config.channels.sellerRequests);
  if (!channel) return null;
  return sendBotMessage(channel, payload);
}

async function handleSellerButton(interaction, client) {
  if (interaction.customId === 'seller:apply') {
    await interaction.showModal(createApplicationModal());
    return true;
  }

  if (interaction.customId.startsWith('seller-app:')) {
    await interaction.deferReply({ flags: EPHEMERAL });
    if (!isStaff(interaction)) {
      await interaction.editReply('Seul le staff peut valider une demande seller.');
      return true;
    }

    const [, action, applicationId] = interaction.customId.split(':');
    const status = action === 'reject' ? 'rejected' : 'approved';
    const tier = action === 'approve-premium' ? 'premium' : 'standard';
    const review = await reviewSellerApplication(applicationId, status, interaction.user.id);

    if (status === 'approved') {
      const profile = await upsertSellerFromApplication(review.application, tier);
      const member = await interaction.guild.members.fetch(review.application.user.id).catch(() => null);
      if (member) {
        await member.roles.add(config.sellerRoleId).catch(() => null);
        if (tier === 'premium') await member.roles.add(config.sellerPremiumRoleId).catch(() => null);
      }
      await updateAccountPrivateChannel(client, profile.seller.userId).catch(() => null);
      await interaction.editReply(`Demande validée: <@${profile.seller.userId}> est maintenant seller ${tier}.`);
    } else {
      await interaction.editReply(`Demande seller refusée pour <@${review.application.user.id}>.`);
    }

    await interaction.message?.edit({ components: [] }).catch(() => null);
    await sendModLog(client, {
      type: 'shop',
      title: status === 'approved' ? '✅ Seller validé' : '❌ Seller refusé',
      description: `${interaction.user} a ${status === 'approved' ? 'validé' : 'refusé'} une demande seller.`,
      fields: [
        { name: 'Membre', value: `<@${review.application.user.id}>`, inline: true },
        { name: 'Formule', value: tier, inline: true }
      ]
    });
    return true;
  }

  if (interaction.customId === 'seller:panel') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isSeller) {
      await interaction.editReply('Tu dois avoir le rôle seller pour ouvrir ce panel.');
      return true;
    }
    await interaction.editReply(buildSellerPanelMessage(seller, access.isPremium));
    return true;
  }

  if (interaction.customId === 'seller:add-product') {
    const { access } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isSeller) {
      await interaction.reply({ content: 'Tu dois avoir le rôle seller.', flags: EPHEMERAL });
      return true;
    }
    await interaction.showModal(createSellerProductModal(MODAL_SELLER_ADD_PRODUCT_ID));
    return true;
  }

  if (interaction.customId === 'seller:view') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isSeller) {
      await interaction.editReply('Tu dois avoir le rôle seller.');
      return true;
    }
    await interaction.editReply(buildSellerOwnCatalogueMessage(seller));
    return true;
  }

  if (interaction.customId === 'seller:edit-product' || interaction.customId === 'seller:stock-product') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isSeller) {
      await interaction.editReply('Tu dois avoir le rôle seller.');
      return true;
    }
    await interaction.editReply(buildSellerProductSelectMessage(
      seller,
      interaction.customId === 'seller:stock-product' ? 'stock' : 'edit'
    ));
    return true;
  }

  if (interaction.customId === 'seller:edit-category') {
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isPremium) {
      await interaction.reply({ content: 'Seuls les sellers premium peuvent modifier leur catégorie.', flags: EPHEMERAL });
      return true;
    }
    await interaction.showModal(createSellerCategoryModal(seller));
    return true;
  }

  if (interaction.customId === 'seller:refresh') {
    await interaction.deferUpdate();
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (seller) await interaction.message.edit(buildSellerPanelMessage(seller, access.isPremium)).catch(() => null);
    return true;
  }

  if (interaction.customId === 'seller:submit') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const { access, seller } = await getOrCreateSellerForInteraction(interaction);
    if (!access.isSeller) {
      await interaction.editReply('Tu dois avoir le rôle seller.');
      return true;
    }

    const result = await submitSellerProducts(interaction.user.id);
    if (result.products.length === 0) {
      await interaction.editReply('Aucun produit brouillon à soumettre. Ajoute ou modifie un produit avant.');
      return true;
    }

    await sendSellerReview(client, buildSellerSubmissionReviewMessage(result.seller, result.products));
    await interaction.editReply(`${result.products.length} produit(s) soumis au staff.`);
    return true;
  }

  if (interaction.customId.startsWith('seller-product:')) {
    await interaction.deferReply({ flags: EPHEMERAL });
    if (!isStaff(interaction)) {
      await interaction.editReply('Seul le staff peut valider des produits seller.');
      return true;
    }

    const [, action, userId] = interaction.customId.split(':');
    const result = await reviewSellerProducts(userId, action === 'approve' ? 'approved' : 'rejected', interaction.user.id);
    await interaction.message?.edit({ components: [] }).catch(() => null);

    if (action === 'approve') {
      await updateSellerPublicMessage(client).catch(() => null);
    }
    await updateAccountPrivateChannel(client, userId).catch(() => null);

    await interaction.editReply(`${result.products.length} produit(s) ${action === 'approve' ? 'validé(s)' : 'refusé(s)'}.`);
    return true;
  }

  if (interaction.customId === 'seller-catalogue:refresh') {
    await interaction.deferUpdate();
    await updateSellerPublicMessage(client);
    return true;
  }

  return false;
}

async function handleSellerSelectMenu(interaction) {
  if (interaction.customId === 'seller-catalogue:category') {
    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.reply({ content: 'Aucun produit seller validé.', flags: EPHEMERAL });
      return true;
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    const store = await readStore();
    const category = getPublicSellerCategories(store).find((item) => item.id === selectedCategoryId);
    if (!category) {
      await interaction.editReply('Catégorie seller introuvable. Clique sur Actualiser puis réessaie.');
      return true;
    }

    await interaction.editReply(buildSellerCatalogueCategoryMessage(category));
    return true;
  }

  if (interaction.customId === 'seller:select-product:edit' || interaction.customId === 'seller:select-product:stock') {
    const selectedProductId = interaction.values[0];
    if (selectedProductId === 'empty') {
      await interaction.reply({ content: 'Aucun produit disponible.', flags: EPHEMERAL });
      return true;
    }

    const seller = await getSeller(interaction.user.id);
    const product = seller?.products?.find((item) => item.id === selectedProductId);
    if (!product) {
      await interaction.reply({ content: 'Produit introuvable.', flags: EPHEMERAL });
      return true;
    }

    if (interaction.customId === 'seller:select-product:stock') {
      await interaction.showModal(createSellerStockModal(product));
    } else {
      await interaction.showModal(createSellerProductModal(`${MODAL_SELLER_EDIT_PRODUCT_PREFIX}${product.id}`, product));
    }
    return true;
  }

  return false;
}

async function handleSellerModalSubmit(interaction, client) {
  if (interaction.customId === MODAL_SELLER_APPLICATION_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await createSellerApplication({
      user: interaction.user,
      member: interaction.member,
      plan: interaction.fields.getTextInputValue('plan'),
      shopName: interaction.fields.getTextInputValue('shopName'),
      products: interaction.fields.getTextInputValue('products'),
      experience: interaction.fields.getTextInputValue('experience'),
      contact: interaction.fields.getTextInputValue('contact')
    });

    await sendSellerReview(client, buildSellerApplicationReviewMessage(result.application));
    await interaction.editReply('Ta demande seller a été envoyée au staff.');
    return true;
  }

  if (interaction.customId === MODAL_SELLER_ADD_PRODUCT_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const result = await addSellerProduct(interaction.user.id, {
        name: interaction.fields.getTextInputValue('name'),
        price: interaction.fields.getTextInputValue('price'),
        stock: interaction.fields.getTextInputValue('stock'),
        imageUrl: interaction.fields.getTextInputValue('imageUrl'),
        description: interaction.fields.getTextInputValue('description')
      });
      await interaction.editReply(`Produit **${result.product.name}** ajouté en brouillon. Clique sur **Soumettre au staff** quand tu es prêt.`);
    } catch (error) {
      await interaction.editReply(`Produit non ajouté: ${error.message}`);
    }
    return true;
  }

  if (interaction.customId.startsWith(MODAL_SELLER_EDIT_PRODUCT_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const productId = interaction.customId.slice(MODAL_SELLER_EDIT_PRODUCT_PREFIX.length);
    try {
      const result = await updateSellerProduct(interaction.user.id, productId, {
        name: interaction.fields.getTextInputValue('name'),
        price: interaction.fields.getTextInputValue('price'),
        stock: interaction.fields.getTextInputValue('stock'),
        imageUrl: interaction.fields.getTextInputValue('imageUrl'),
        description: interaction.fields.getTextInputValue('description')
      });
      await interaction.editReply(`Produit **${result.product.name}** modifié. Soumets-le au staff pour validation.`);
    } catch (error) {
      await interaction.editReply(`Produit non modifié: ${error.message}`);
    }
    return true;
  }

  if (interaction.customId.startsWith(MODAL_SELLER_STOCK_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });
    const productId = interaction.customId.slice(MODAL_SELLER_STOCK_PREFIX.length);
    try {
      const result = await adjustSellerProductStock(
        interaction.user.id,
        productId,
        interaction.fields.getTextInputValue('variation')
      );
      await updateSellerPublicMessage(client).catch(() => null);
      await interaction.editReply(`Stock de **${result.product.name}** modifié: ${result.oldStock} → ${result.newStock}.`);
    } catch (error) {
      await interaction.editReply(`Stock non modifié: ${error.message}`);
    }
    return true;
  }

  if (interaction.customId === MODAL_SELLER_CATEGORY_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const result = await updateSellerCategory(interaction.user.id, {
        name: interaction.fields.getTextInputValue('name'),
        emoji: interaction.fields.getTextInputValue('emoji'),
        description: interaction.fields.getTextInputValue('description')
      });
      await updateSellerPublicMessage(client).catch(() => null);
      await interaction.editReply(`Catégorie premium **${result.seller.category.name}** mise à jour.`);
    } catch (error) {
      await interaction.editReply(`Catégorie non modifiée: ${error.message}`);
    }
    return true;
  }

  return false;
}

module.exports = {
  handleSellerButton,
  handleSellerModalSubmit,
  handleSellerSelectMenu,
  updateSellerPublicMessage
};
