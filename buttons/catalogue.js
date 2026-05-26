const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const config = require('../config');
const {
  addBalance,
  addCartItems,
  clearCartProduct,
  getAccount,
  loginAccount,
  subtractBalance
} = require('../services/accounts');
const {
  addCategory,
  addProduct,
  adjustProductStock,
  decrementProductStock,
  decrementProductsStock,
  deleteCategory,
  deleteProduct,
  findCategory,
  findProduct,
  getCatalogue,
  markCataloguePublished,
  markRestockAnnounced,
  savePublicMessage,
  updateCategory,
  updateProduct
} = require('../services/catalogue');
const {
  createOrder,
  getOrderStats,
  saveStatsMessage
} = require('../services/orders');
const {
  buildAddedToCartMessage,
  buildAdminCategorySelectMessage,
  buildAdminProductSelectMessage,
  buildCartMessage,
  buildCatalogueAdminMessage,
  buildCatalogueCategoryMessage,
  buildCataloguePublicMessage,
  buildOrderLogMessage,
  buildRevenueStatsMessage,
  buildRestockMessage
} = require('../templates/embeds');
const { ensureAccountPrivateChannel, updateAccountPrivateChannel } = require('../utils/accountPrivate');
const { fetchTextChannel } = require('../utils/channels');
const { sendModLog } = require('../utils/modLogs');
const { sendBotMessage } = require('../utils/messages');

const MODAL_ADD_CATEGORY_ID = 'catalogue-admin:modal:add-category';
const MODAL_ADD_PRODUCT_PREFIX = 'catalogue-admin:modal:add-product:';
const MODAL_EDIT_CATEGORY_PREFIX = 'catalogue-admin:modal:edit-category:';
const MODAL_EDIT_PRODUCT_PREFIX = 'catalogue-admin:modal:edit-product:';
const MODAL_STOCK_PREFIX = 'catalogue-admin:modal:stock:';
const MODAL_CART_QUANTITY_ID = 'catalogue:modal:add-cart-quantity';
const EPHEMERAL = 64;
const pendingCartSelections = new Map();

function isConnected(account) {
  return Boolean(account?.lastLoginAt);
}

function parsePrice(value) {
  const match = String(value || '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);
  const price = match ? Number.parseFloat(match[0]) : Number.NaN;

  return Number.isFinite(price) ? Number(price.toFixed(2)) : null;
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}€`;
}

function getCartItems(account) {
  if (Array.isArray(account?.cartItems)) {
    return account.cartItems;
  }

  return account?.cartProductId
    ? [{ productId: account.cartProductId, quantity: 1 }]
    : [];
}

function enrichCartItems(store, cartItems) {
  const enrichedItems = [];
  const missingItems = [];

  for (const item of cartItems || []) {
    const productId = String(item.productId || '').trim();
    const quantity = Number.parseInt(String(item.quantity || '1'), 10);

    if (!productId || Number.isNaN(quantity) || quantity <= 0) continue;

    const result = findProduct(store, productId);
    if (!result) {
      missingItems.push(item);
      continue;
    }

    enrichedItems.push({
      productId,
      quantity,
      product: result.product,
      category: result.category
    });
  }

  return { enrichedItems, missingItems };
}

function parseQuantities(value, count) {
  const parts = String(value || '')
    .split(/[,\n; ]+/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((quantity) => !Number.isNaN(quantity) && quantity > 0);

  if (parts.length === 0) {
    return Array.from({ length: count }, () => 1);
  }

  if (parts.length === 1) {
    return Array.from({ length: count }, () => parts[0]);
  }

  return Array.from({ length: count }, (_, index) => parts[index] || 1);
}

function createCartQuantityModal(selectionCount) {
  const isMultiple = selectionCount > 1;

  return new ModalBuilder()
    .setCustomId(MODAL_CART_QUANTITY_ID)
    .setTitle(isMultiple ? 'Quantités du panier' : 'Ajouter au panier')
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput(
          'quantities',
          isMultiple ? 'Quantités dans l’ordre' : 'Quantité à ajouter',
          TextInputStyle.Short,
          true,
          isMultiple ? 'Exemple: 2, 1, 5' : 'Exemple: 20',
          '1'
        )
      )
    );
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

async function postOrderNotifications(client, order, product) {
  const orderChannel = await fetchTextChannel(client, config.channels.commandeLogs);
  if (orderChannel) {
    await sendBotMessage(orderChannel, buildOrderLogMessage(order, product));
  }

  await updateRevenueStats(client);
}

function createTextInput(customId, label, style, required = true, placeholder = '', value = '') {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setPlaceholder(placeholder);

  if (value) {
    input.setValue(value);
  }

  return input;
}

function createAddCategoryModal() {
  return new ModalBuilder()
    .setCustomId(MODAL_ADD_CATEGORY_ID)
    .setTitle('Ajouter une catégorie')
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom de la catégorie', TextInputStyle.Short, true, 'Exemple: Nitro')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('emoji', 'Emoji', TextInputStyle.Short, false, 'Exemple: 💎')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Décris cette catégorie.')
      )
    );
}

function createAddProductModal(categoryId, categoryName) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_ADD_PRODUCT_PREFIX}${categoryId}`)
    .setTitle(`Produit: ${categoryName}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom du produit', TextInputStyle.Short, true, 'Exemple: Nitro Boost 1 mois')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('price', 'Prix', TextInputStyle.Short, true, 'Exemple: 4.99€')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('stock', 'Stock de départ', TextInputStyle.Short, true, 'Exemple: 10')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('imageUrl', 'Lien image du produit', TextInputStyle.Short, true, 'https://...')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Détails du produit.')
      )
    );
}

function createEditCategoryModal(category) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_EDIT_CATEGORY_PREFIX}${category.id}`)
    .setTitle(`Catégorie: ${category.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom de la catégorie', TextInputStyle.Short, true, 'Exemple: Nitro', category.name)
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('emoji', 'Emoji', TextInputStyle.Short, false, 'Exemple: 💎', category.emoji || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Décris cette catégorie.', category.description || '')
      )
    );
}

function createEditProductModal(product) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_EDIT_PRODUCT_PREFIX}${product.id}`)
    .setTitle(`Produit: ${product.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput('name', 'Nom du produit', TextInputStyle.Short, true, 'Exemple: Nitro Boost 1 mois', product.name)
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('price', 'Prix', TextInputStyle.Short, true, 'Exemple: 4.99€', product.price)
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('stock', 'Stock total', TextInputStyle.Short, true, 'Exemple: 10', String(product.stock || 0))
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('imageUrl', 'Lien image du produit', TextInputStyle.Short, false, 'https://...', product.imageUrl || '')
      ),
      new ActionRowBuilder().addComponents(
        createTextInput('description', 'Description', TextInputStyle.Paragraph, true, 'Détails du produit.', product.description || '')
      )
    );
}

function createStockModal(productId, productName, currentStock) {
  return new ModalBuilder()
    .setCustomId(`${MODAL_STOCK_PREFIX}${productId}`)
    .setTitle(`Stock: ${productName}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        createTextInput(
          'variation',
          'Variation du stock (+ ou -)',
          TextInputStyle.Short,
          true,
          'Exemple: 10 ou -3'
        )
      ),
      new ActionRowBuilder().addComponents(
        createTextInput(
          'note',
          'Note admin optionnelle',
          TextInputStyle.Paragraph,
          false,
          'Exemple: restock fournisseur',
          `Stock actuel: ${currentStock}`
        )
      )
    );
}

async function publishCatalogue(client) {
  const publishResult = await markCataloguePublished();
  let finalStore = publishResult.store;
  const channel = await fetchTextChannel(client, config.channels.catalogue);

  if (!channel) {
    throw new Error('Salon catalogue public introuvable.');
  }

  let message = null;
  const savedMessage = finalStore.publicMessage;

  if (savedMessage?.channelId && savedMessage?.messageId) {
    const savedChannel = await fetchTextChannel(client, savedMessage.channelId);
    if (savedChannel) {
      message = await savedChannel.messages.fetch(savedMessage.messageId).catch(() => null);
    }
  }

  if (message) {
    await message.edit(buildCataloguePublicMessage(finalStore));
  } else {
    message = await sendBotMessage(channel, buildCataloguePublicMessage(finalStore));
    await savePublicMessage(channel.id, message.id);
  }

  await savePublicMessage(channel.id, message.id);

  if (publishResult.productsToAnnounce.length > 0) {
    const restockChannel = await fetchTextChannel(client, config.channels.restock);
    if (restockChannel) {
      for (const product of publishResult.productsToAnnounce) {
        await sendBotMessage(restockChannel, buildRestockMessage([product]));
      }
      finalStore = await markRestockAnnounced(publishResult.productsToAnnounce.map((product) => product.id));
    } else {
      console.warn('[RESTOCK] Salon restock introuvable. Verifie RESTOCK_CHANNEL_ID dans .env.');
    }
  }

  return { store: finalStore, productsToAnnounce: publishResult.productsToAnnounce, message };
}

async function handleCatalogueButton(interaction, client) {
  if (interaction.customId === 'catalogue:cart') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const account = await getAccount(interaction.user.id);
    if (!isConnected(account)) {
      await interaction.editReply('Connecte-toi à ton compte HEXA_HUB avant d’ouvrir ton panier.');
      return true;
    }

    if (account.shopBlocked) {
      await interaction.editReply(`Tu es bloqué de la boutique. Raison: ${account.shopBlockedReason || 'Aucune raison indiquée.'}`);
      return true;
    }

    const cartItems = getCartItems(account);
    if (cartItems.length === 0) {
      await interaction.editReply('Ton panier est vide. Sélectionne une catégorie puis ajoute un produit au panier.');
      return true;
    }

    const store = await getCatalogue();
    const { enrichedItems, missingItems } = enrichCartItems(store, cartItems);

    if (missingItems.length > 0 || enrichedItems.length === 0) {
      await clearCartProduct(interaction.user.id);
      await interaction.editReply('Un produit dans ton panier n’existe plus. Ton panier a été vidé.');
      return true;
    }

    await interaction.editReply(buildCartMessage(enrichedItems, account));
    return true;
  }

  if (interaction.customId === 'catalogue:login') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const result = await loginAccount(interaction.user);
    if (!result.exists) {
      await interaction.editReply('Tu n as pas encore de compte HEXA_HUB. Utilise le bouton **Créer un compte** dans le salon comptes.');
      return true;
    }

    const balance = Number(result.account.balance || 0).toFixed(2);
    const privateChannel = await ensureAccountPrivateChannel(client, interaction.guild, interaction.user, result.account)
      .catch((error) => {
        console.warn('[CATALOGUE] Impossible de mettre a jour le salon prive:', error.message);
        return null;
      });

    await interaction.editReply([
      `Connexion réussie. Ton solde HEXA_HUB est de **${balance}€**.`,
      privateChannel ? `Ton salon prive: ${privateChannel}` : null
    ].filter(Boolean).join('\n'));
    return true;
  }

  if (interaction.customId === 'catalogue:refresh') {
    await interaction.deferUpdate();

    const store = await getCatalogue();
    await interaction.message.edit(buildCataloguePublicMessage(store));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:add-category') {
    await interaction.showModal(createAddCategoryModal());
    return true;
  }

  if (interaction.customId === 'catalogue-admin:add-product') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminCategorySelectMessage(store, 'addProduct'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:edit-category') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminCategorySelectMessage(store, 'editCategory'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:delete-category') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminCategorySelectMessage(store, 'deleteCategory'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:stock-product') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminProductSelectMessage(store, 'stockProduct'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:edit-product') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminProductSelectMessage(store, 'editProduct'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:delete-product') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(buildAdminProductSelectMessage(store, 'deleteProduct'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:preview') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    await interaction.editReply(
      buildCataloguePublicMessage(store, {
        includeDrafts: true,
        categorySelectCustomId: 'catalogue-admin:preview-category'
      })
    );
    return true;
  }

  if (interaction.customId === 'catalogue-admin:refresh') {
    await interaction.deferUpdate();

    const store = await getCatalogue();
    await interaction.message.edit(buildCatalogueAdminMessage(store));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:publish') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const result = await publishCatalogue(client);
    await interaction.message.edit(buildCatalogueAdminMessage(result.store)).catch(() => null);

    await interaction.editReply(
      `Catalogue public mis à jour. ${result.productsToAnnounce.length} produit(s) annoncé(s) dans le salon nouveautés/restock.`
    );
    await sendModLog(client, {
      type: 'shop',
      title: '📣 Catalogue publié',
      description: `${interaction.user} a publié le catalogue public.`,
      fields: [
        { name: 'Produits annoncés', value: String(result.productsToAnnounce.length), inline: true }
      ]
    });
    return true;
  }

  if (interaction.customId.startsWith('catalogue:add-cart:')) {
    const productId = interaction.customId.slice('catalogue:add-cart:'.length);
    pendingCartSelections.set(interaction.user.id, {
      productIds: [productId],
      createdAt: Date.now()
    });
    await interaction.showModal(createCartQuantityModal(1));
    return true;
  }

  if (interaction.customId === 'catalogue:cart-clear') {
    await interaction.deferReply({ flags: EPHEMERAL });
    await clearCartProduct(interaction.user.id);
    await interaction.editReply('Ton panier a été vidé.');
    return true;
  }

  if (interaction.customId === 'catalogue:order-cart') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const account = await getAccount(interaction.user.id);

    if (!isConnected(account)) {
      await interaction.editReply('Connecte-toi à ton compte HEXA_HUB avant de commander.');
      return true;
    }

    if (account?.shopBlocked) {
      await interaction.editReply(`Tu es bloqué de la boutique. Raison: ${account.shopBlockedReason || 'Aucune raison indiquée.'}`);
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '🚫 Commande bloquée',
        description: `${interaction.user} a tenté de commander alors qu’il est bloqué boutique.`,
        fields: [
          { name: 'Raison', value: account.shopBlockedReason || 'Aucune raison indiquée.', inline: false }
        ]
      });
      return true;
    }

    const cartItems = getCartItems(account);
    if (cartItems.length === 0) {
      await interaction.editReply('Ton panier est vide.');
      return true;
    }

    let store = await getCatalogue();
    const { enrichedItems, missingItems } = enrichCartItems(store, cartItems);

    if (missingItems.length > 0 || enrichedItems.length === 0) {
      await clearCartProduct(interaction.user.id);
      await interaction.editReply('Un produit dans ton panier n’existe plus. Ton panier a été vidé.');
      return true;
    }

    const priceIssue = enrichedItems.find((item) => parsePrice(item.product.price) === null);
    if (priceIssue) {
      await interaction.editReply(`Prix invalide pour **${priceIssue.product.name}**. Contacte le staff.`);
      return true;
    }

    const stockIssue = enrichedItems.find((item) => Number(item.product.stock || 0) < Number(item.quantity || 1));
    if (stockIssue) {
      await interaction.editReply(
        `Stock insuffisant pour **${stockIssue.product.name}**. Stock actuel: ${stockIssue.product.stock || 0}.`
      );
      return true;
    }

    const totalPrice = enrichedItems.reduce((total, item) =>
      total + parsePrice(item.product.price) * Number(item.quantity || 1), 0);
    const currentBalance = Number(account.balance || 0);

    if (currentBalance < totalPrice) {
      await interaction.editReply([
        'Solde insuffisant pour commander ce panier.',
        `Total: **${formatMoney(totalPrice)}**`,
        `Ton solde: **${formatMoney(currentBalance)}**`,
        'Utilise le bouton **Ajouter du solde** dans ton espace privé.'
      ].join('\n'));
      return true;
    }

    const payment = await subtractBalance(interaction.user.id, totalPrice);
    if (!payment.ok) {
      await interaction.editReply('Solde insuffisant ou compte introuvable. Clique sur **Se connecter** puis réessaie.');
      return true;
    }

    let stockResult = null;
    try {
      stockResult = await decrementProductsStock(
        enrichedItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      );
    } catch (error) {
      await addBalance(interaction.user, totalPrice).catch(() => null);
      await interaction.editReply(`Commande impossible: ${error.message}. Ton solde a été remboursé.`);
      return true;
    }

    const orderItems = stockResult.items.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      categoryId: item.category.id,
      categoryName: item.category.name,
      price: item.product.price,
      quantity: item.quantity,
      imageUrl: item.product.imageUrl || null
    }));

    let order = null;
    try {
      order = await createOrder({
        user: interaction.user,
        member: interaction.member,
        product: {
          items: orderItems,
          totalPrice: formatMoney(totalPrice)
        },
        category: null
      });
    } catch (error) {
      await addBalance(interaction.user, totalPrice).catch(() => null);
      for (const item of stockResult.items) {
        await adjustProductStock(item.product.id, item.quantity).catch(() => null);
      }
      await interaction.editReply(`Commande impossible: ${error.message}. Ton solde a été remboursé.`);
      return true;
    }

    const updatedAccount = await clearCartProduct(interaction.user.id);
    const orderedLines = orderItems.map((item) =>
      `• x${item.quantity} ${item.productName}`
    ).join('\n');

    await interaction.editReply(
      [
        'Commande créée pour ton panier.',
        `ID commande: **${order.id}**`,
        orderedLines,
        `Total: **${formatMoney(totalPrice)}**`,
        `Solde restant: **${formatMoney((updatedAccount || payment.account).balance || 0)}**`
      ].join('\n')
    );
    await postOrderNotifications(interaction.client, order, stockResult.items[0]?.product).catch((error) => {
      console.warn('[COMMANDES] Impossible de poster les notifications commande:', error.message);
    });
    await updateAccountPrivateChannel(interaction.client, interaction.user.id).catch((error) => {
      console.warn('[CATALOGUE] Impossible de mettre a jour le salon prive:', error.message);
    });
    await sendModLog(interaction.client, {
      type: 'shop',
      title: '🛒 Commande créée',
      description: `${interaction.user} a créé une commande panier.`,
      fields: [
        { name: 'ID commande', value: order.id, inline: true },
        { name: 'Articles', value: String(order.quantity || orderItems.length), inline: true },
        { name: 'Total', value: formatMoney(totalPrice), inline: true }
      ]
    });

    const catalogueChannel = await fetchTextChannel(interaction.client, config.channels.catalogue);
    if (catalogueChannel) {
      store = await getCatalogue();
      const savedMessage = store.publicMessage;
      if (savedMessage?.messageId) {
        const message = await catalogueChannel.messages.fetch(savedMessage.messageId).catch(() => null);
        if (message) {
          await message.edit(buildCataloguePublicMessage(store)).catch(() => null);
        }
      }
    }
    return true;
  }

  if (interaction.customId.startsWith('catalogue:order:')) {
    await interaction.deferReply({ flags: EPHEMERAL });

    await interaction.editReply('Le système panier a été mis à jour. Ouvre ton **Panier** puis clique sur **Commander le panier**.');
    return true;

    const productId = interaction.customId.slice('catalogue:order:'.length);
    const account = await getAccount(interaction.user.id);

    if (!isConnected(account)) {
      await interaction.editReply('Connecte-toi à ton compte HEXA_HUB avant de commander.');
      return true;
    }

    if (account.cartProductId !== productId) {
      await interaction.editReply('Ajoute ce produit au panier avant de le commander.');
      return true;
    }

    if (account?.shopBlocked) {
      await interaction.editReply(`Tu es bloqué de la boutique. Raison: ${account.shopBlockedReason || 'Aucune raison indiquée.'}`);
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '🚫 Commande bloquée',
        description: `${interaction.user} a tenté de commander alors qu’il est bloqué boutique.`,
        fields: [
          { name: 'Raison', value: account.shopBlockedReason || 'Aucune raison indiquée.', inline: false }
        ]
      });
      return true;
    }

    let store = await getCatalogue();
    let result = findProduct(store, productId);

    if (!result) {
      await interaction.editReply('Produit introuvable.');
      return true;
    }

    if (Number(result.product.stock || 0) <= 0) {
      await interaction.editReply('Ce produit est en rupture de stock, tu ne peux pas le commander.');
      return true;
    }

    const price = parsePrice(result.product.price);
    if (price === null) {
      await interaction.editReply('Prix invalide pour ce produit. Contacte le staff.');
      return true;
    }

    const currentBalance = Number(account.balance || 0);
    if (currentBalance < price) {
      await interaction.editReply([
        'Solde insuffisant pour commander ce produit.',
        `Prix: **${price.toFixed(2)}€**`,
        `Ton solde: **${currentBalance.toFixed(2)}€**`,
        'Utilise le bouton **Ajouter du solde** dans ton espace privé.'
      ].join('\n'));
      return true;
    }

    const payment = await subtractBalance(interaction.user.id, price);
    if (!payment.ok) {
      await interaction.editReply('Solde insuffisant ou compte introuvable. Clique sur **Se connecter** puis réessaie.');
      return true;
    }

    let stockResult = null;
    try {
      stockResult = await decrementProductStock(productId, 1);
    } catch (error) {
      await addBalance(interaction.user, price).catch(() => null);
      await interaction.editReply(`Commande impossible: ${error.message}. Ton solde a été remboursé.`);
      return true;
    }

    result = stockResult;
    let order = null;
    try {
      order = await createOrder({
        user: interaction.user,
        member: interaction.member,
        product: result.product,
        category: result.category
      });
    } catch (error) {
      await addBalance(interaction.user, price).catch(() => null);
      await adjustProductStock(productId, 1).catch(() => null);
      await interaction.editReply(`Commande impossible: ${error.message}. Ton solde a été remboursé.`);
      return true;
    }
    const updatedAccount = await clearCartProduct(interaction.user.id);

    await interaction.editReply(
      [
        `Commande créée pour **${result.product.name}**.`,
        `ID commande: **${order.id}**`,
        `Stock restant: **${result.newStock}**`,
        `Solde restant: **${Number((updatedAccount || payment.account).balance || 0).toFixed(2)}€**`
      ].join('\n')
    );
    await postOrderNotifications(interaction.client, order, result.product).catch((error) => {
      console.warn('[COMMANDES] Impossible de poster les notifications commande:', error.message);
    });
    await updateAccountPrivateChannel(interaction.client, interaction.user.id).catch((error) => {
      console.warn('[CATALOGUE] Impossible de mettre a jour le salon prive:', error.message);
    });
    await sendModLog(interaction.client, {
      type: 'shop',
      title: '🛒 Commande créée',
      description: `${interaction.user} a créé une commande.`,
      fields: [
        { name: 'ID commande', value: order.id, inline: true },
        { name: 'Produit', value: result.product.name, inline: true },
        { name: 'Stock', value: `${result.oldStock} → ${result.newStock}`, inline: true }
      ]
    });

    const catalogueChannel = await fetchTextChannel(interaction.client, config.channels.catalogue);
    if (catalogueChannel) {
      store = await getCatalogue();
      const savedMessage = store.publicMessage;
      if (savedMessage?.messageId) {
        const message = await catalogueChannel.messages.fetch(savedMessage.messageId).catch(() => null);
        if (message) {
          await message.edit(buildCataloguePublicMessage(store)).catch(() => null);
        }
      }
    }
    return true;
  }

  return false;
}

async function handleCatalogueSelectMenu(interaction) {
  if (interaction.customId === 'catalogue:category') {
    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.reply({ content: 'Aucune catégorie disponible pour le moment.', flags: EPHEMERAL });
      return true;
    }

    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    const category = findCategory(store, selectedCategoryId);

    if (!category) {
      await interaction.editReply('Catégorie introuvable. Clique sur Actualiser puis réessaie.');
      return true;
    }

    await interaction.editReply(buildCatalogueCategoryMessage(category));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:preview-category') {
    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.reply({ content: 'Aucune catégorie disponible pour le moment.', flags: EPHEMERAL });
      return true;
    }

    await interaction.deferReply({ flags: EPHEMERAL });

    const store = await getCatalogue();
    const category = findCategory(store, selectedCategoryId);

    if (!category) {
      await interaction.editReply('Catégorie introuvable.');
      return true;
    }

    await interaction.editReply(
      buildCatalogueCategoryMessage(category, {
        includeDrafts: true,
        showOrderSelect: false
      })
    );
    return true;
  }

  if (interaction.customId === 'catalogue:product') {
    const selectedProductIds = interaction.values.filter((value) => value !== 'empty');
    if (selectedProductIds.length === 0) {
      await interaction.reply({ content: 'Aucun produit disponible pour cette catégorie.', flags: EPHEMERAL });
      return true;
    }

    pendingCartSelections.set(interaction.user.id, {
      productIds: selectedProductIds,
      createdAt: Date.now()
    });
    await interaction.showModal(createCartQuantityModal(selectedProductIds.length));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-category:add-product') {
    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.reply({ content: 'Aucune catégorie disponible.', flags: EPHEMERAL });
      return true;
    }

    await interaction.showModal(createAddProductModal(selectedCategoryId, 'Catalogue'));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-category:delete') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.editReply('Aucune catégorie à supprimer.');
      return true;
    }

    const result = await deleteCategory(selectedCategoryId);
    if (!result.deleted) {
      await interaction.editReply('Catégorie introuvable.');
      return true;
    }

    await interaction.editReply(`Catégorie **${result.category.name}** supprimée. Clique sur **Actualiser** dans le panel admin.`);
    await sendModLog(interaction.client, {
      type: 'shop',
      title: '🗑️ Catégorie supprimée',
      description: `${interaction.user} a supprimé une catégorie du catalogue.`,
      fields: [
        { name: 'Catégorie', value: result.category.name, inline: true }
      ]
    });
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-category:edit') {
    const selectedCategoryId = interaction.values[0];
    if (selectedCategoryId === 'empty') {
      await interaction.reply({ content: 'Aucune catégorie à modifier.', flags: EPHEMERAL });
      return true;
    }

    const store = await getCatalogue();
    const category = findCategory(store, selectedCategoryId);

    if (!category) {
      await interaction.reply({ content: 'Catégorie introuvable.', flags: EPHEMERAL });
      return true;
    }

    await interaction.showModal(createEditCategoryModal(category));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-product:stock') {
    const selectedProductId = interaction.values[0];
    if (selectedProductId === 'empty') {
      await interaction.reply({ content: 'Aucun produit disponible.', flags: EPHEMERAL });
      return true;
    }

    const store = await getCatalogue();
    const result = findProduct(store, selectedProductId);
    if (!result) {
      await interaction.reply({ content: 'Produit introuvable.', flags: EPHEMERAL });
      return true;
    }

    await interaction.showModal(createStockModal(selectedProductId, result.product.name, Number(result.product.stock || 0)));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-product:edit') {
    const selectedProductId = interaction.values[0];
    if (selectedProductId === 'empty') {
      await interaction.reply({ content: 'Aucun produit disponible.', flags: EPHEMERAL });
      return true;
    }

    const store = await getCatalogue();
    const result = findProduct(store, selectedProductId);
    if (!result) {
      await interaction.reply({ content: 'Produit introuvable.', flags: EPHEMERAL });
      return true;
    }

    await interaction.showModal(createEditProductModal(result.product));
    return true;
  }

  if (interaction.customId === 'catalogue-admin:select-product:delete') {
    await interaction.deferReply({ flags: EPHEMERAL });

    const selectedProductId = interaction.values[0];
    if (selectedProductId === 'empty') {
      await interaction.editReply('Aucun produit à supprimer.');
      return true;
    }

    const result = await deleteProduct(selectedProductId);
    if (!result.deleted) {
      await interaction.editReply('Produit introuvable.');
      return true;
    }

    await interaction.editReply(`Produit **${result.product.name}** supprimé de **${result.category.name}**. Clique sur **Actualiser** dans le panel admin.`);
    await sendModLog(interaction.client, {
      type: 'shop',
      title: '🗑️ Produit supprimé',
      description: `${interaction.user} a supprimé un produit du catalogue.`,
      fields: [
        { name: 'Produit', value: result.product.name, inline: true },
        { name: 'Catégorie', value: result.category.name, inline: true }
      ]
    });
    return true;
  }

  return false;
}

async function handleCatalogueModalSubmit(interaction) {
  if (interaction.customId === MODAL_CART_QUANTITY_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const selection = pendingCartSelections.get(interaction.user.id);
    pendingCartSelections.delete(interaction.user.id);

    if (!selection || Date.now() - selection.createdAt > 5 * 60 * 1000) {
      await interaction.editReply('Sélection expirée. Choisis à nouveau le produit dans le catalogue.');
      return true;
    }

    const account = await getAccount(interaction.user.id);
    if (!isConnected(account)) {
      await interaction.editReply('Connecte-toi à ton compte HEXA_HUB avant d’ajouter un produit au panier.');
      return true;
    }

    if (account.shopBlocked) {
      await interaction.editReply(`Tu es bloqué de la boutique. Raison: ${account.shopBlockedReason || 'Aucune raison indiquée.'}`);
      return true;
    }

    const quantities = parseQuantities(
      interaction.fields.getTextInputValue('quantities'),
      selection.productIds.length
    );
    const store = await getCatalogue();
    const itemsToAdd = [];
    const addedItems = [];

    for (const [index, productId] of selection.productIds.entries()) {
      const result = findProduct(store, productId);

      if (!result) {
        await interaction.editReply('Un produit sélectionné est introuvable. Actualise le catalogue puis réessaie.');
        return true;
      }

      const quantity = Math.max(Number(quantities[index] || 1), 1);
      const stock = Number(result.product.stock || 0);
      const alreadyInCart = getCartItems(account).find((item) => item.productId === productId)?.quantity || 0;

      if (stock <= 0) {
        await interaction.editReply(`**${result.product.name}** est en rupture de stock.`);
        return true;
      }

      if (stock < alreadyInCart + quantity) {
        await interaction.editReply(
          `Stock insuffisant pour **${result.product.name}**. Stock actuel: ${stock}, déjà dans ton panier: ${alreadyInCart}.`
        );
        return true;
      }

      itemsToAdd.push({ productId, quantity });
      addedItems.push({
        product: result.product,
        category: result.category,
        quantity
      });
    }

    const updatedAccount = await addCartItems(interaction.user.id, itemsToAdd);

    if (!updatedAccount) {
      await interaction.editReply('Compte introuvable. Crée ou connecte-toi à ton compte puis réessaie.');
      return true;
    }

    await interaction.editReply(buildAddedToCartMessage(addedItems, updatedAccount));
    return true;
  }

  if (interaction.customId === MODAL_ADD_CATEGORY_ID) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const result = await addCategory({
      name: interaction.fields.getTextInputValue('name'),
      emoji: interaction.fields.getTextInputValue('emoji'),
      description: interaction.fields.getTextInputValue('description')
    });

    const action = result.created ? 'créée' : 'mise à jour';
    await interaction.editReply(`Catégorie **${result.category.name}** ${action}. Clique sur **Actualiser** dans le panel admin.`);
    await sendModLog(interaction.client, {
      type: 'shop',
      title: '📁 Catégorie catalogue',
      description: `${interaction.user} a ${action} une catégorie.`,
      fields: [
        { name: 'Catégorie', value: result.category.name, inline: true }
      ]
    });
    return true;
  }

  if (interaction.customId.startsWith(MODAL_ADD_PRODUCT_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const categoryId = interaction.customId.slice(MODAL_ADD_PRODUCT_PREFIX.length);

    try {
      const result = await addProduct({
        categoryId,
        name: interaction.fields.getTextInputValue('name'),
        price: interaction.fields.getTextInputValue('price'),
        stock: interaction.fields.getTextInputValue('stock'),
        imageUrl: interaction.fields.getTextInputValue('imageUrl'),
        description: interaction.fields.getTextInputValue('description')
      });

      await interaction.editReply(
        `Produit **${result.product.name}** ajouté dans **${result.category.name}**. Il sera visible après **Publier**.`
      );
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '🛍️ Produit ajouté',
        description: `${interaction.user} a ajouté un produit au catalogue.`,
        fields: [
          { name: 'Produit', value: result.product.name, inline: true },
          { name: 'Catégorie', value: result.category.name, inline: true },
          { name: 'Stock', value: String(result.product.stock || 0), inline: true }
        ]
      });
    } catch (error) {
      await interaction.editReply(`Produit non ajouté: ${error.message}`);
    }

    return true;
  }

  if (interaction.customId.startsWith(MODAL_EDIT_CATEGORY_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const categoryId = interaction.customId.slice(MODAL_EDIT_CATEGORY_PREFIX.length);

    try {
      const result = await updateCategory(categoryId, {
        name: interaction.fields.getTextInputValue('name'),
        emoji: interaction.fields.getTextInputValue('emoji'),
        description: interaction.fields.getTextInputValue('description')
      });

      await interaction.editReply(`Catégorie **${result.category.name}** modifiée. Clique sur **Actualiser** dans le panel admin.`);
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '✏️ Catégorie modifiée',
        description: `${interaction.user} a modifié une catégorie du catalogue.`,
        fields: [
          { name: 'Catégorie', value: result.category.name, inline: true }
        ]
      });
    } catch (error) {
      await interaction.editReply(`Catégorie non modifiée: ${error.message}`);
    }

    return true;
  }

  if (interaction.customId.startsWith(MODAL_EDIT_PRODUCT_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const productId = interaction.customId.slice(MODAL_EDIT_PRODUCT_PREFIX.length);

    try {
      const result = await updateProduct(productId, {
        name: interaction.fields.getTextInputValue('name'),
        price: interaction.fields.getTextInputValue('price'),
        stock: interaction.fields.getTextInputValue('stock'),
        imageUrl: interaction.fields.getTextInputValue('imageUrl'),
        description: interaction.fields.getTextInputValue('description')
      });

      await interaction.editReply(
        `Produit **${result.product.name}** modifié. Stock: ${result.oldStock} → ${result.newStock}. Clique sur **Publier** pour mettre à jour le catalogue public.`
      );
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '✏️ Produit modifié',
        description: `${interaction.user} a modifié un produit du catalogue.`,
        fields: [
          { name: 'Produit', value: result.product.name, inline: true },
          { name: 'Catégorie', value: result.category.name, inline: true },
          { name: 'Stock', value: `${result.oldStock} → ${result.newStock}`, inline: true }
        ]
      });
    } catch (error) {
      await interaction.editReply(`Produit non modifié: ${error.message}`);
    }

    return true;
  }

  if (interaction.customId.startsWith(MODAL_STOCK_PREFIX)) {
    await interaction.deferReply({ flags: EPHEMERAL });

    const productId = interaction.customId.slice(MODAL_STOCK_PREFIX.length);

    try {
      const result = await adjustProductStock(
        productId,
        interaction.fields.getTextInputValue('variation')
      );

      await interaction.editReply(
        `Stock de **${result.product.name}** modifié: ${result.oldStock} → ${result.newStock}. Clique sur **Publier** pour annoncer le restock si tu as ajouté du stock.`
      );
      await sendModLog(interaction.client, {
        type: 'shop',
        title: '📦 Stock modifié',
        description: `${interaction.user} a modifié le stock d’un produit.`,
        fields: [
          { name: 'Produit', value: result.product.name, inline: true },
          { name: 'Variation', value: String(result.variation), inline: true },
          { name: 'Stock', value: `${result.oldStock} → ${result.newStock}`, inline: true }
        ]
      });
    } catch (error) {
      await interaction.editReply(`Stock non modifié: ${error.message}`);
    }

    return true;
  }

  return false;
}

module.exports = {
  handleCatalogueButton,
  handleCatalogueModalSubmit,
  handleCatalogueSelectMenu
};
