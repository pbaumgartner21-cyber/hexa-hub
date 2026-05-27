const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const config = require('../config');
const { attachBanner } = require('../utils/banner');
const { channelMentionByName } = require('../utils/channels');

function createBaseEmbed(authorName, footerText) {
  return new EmbedBuilder()
    .setAuthor({ name: authorName })
    .setColor(config.embedColor)
    .setFooter({ text: footerText })
    .setTimestamp();
}

function formatDiscordDate(value) {
  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return `<t:${timestamp}:F>`;
}

function formatOptionalDiscordDate(value) {
  if (!value) return 'Jamais';

  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isNaN(timestamp) ? 'Inconnue' : `<t:${timestamp}:F>`;
}

function trimText(value, maxLength) {
  if (!value) return 'Aucune description.';
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function parsePrice(value) {
  const match = String(value || '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);
  const price = match ? Number.parseFloat(match[0]) : Number.NaN;

  return Number.isFinite(price) ? Number(price.toFixed(2)) : 0;
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)}€`;
}

function getOrderItems(order) {
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items;
  }

  return [{
    productId: order.productId,
    productName: order.productName,
    categoryId: order.categoryId,
    categoryName: order.categoryName,
    price: order.price,
    quantity: order.quantity || 1
  }];
}

function formatOrderItems(order, maxLength = 900) {
  const items = getOrderItems(order).map((item) => {
    const quantity = Number(item.quantity || 1);
    return `• x${quantity} ${trimText(item.productName, 60)} - ${trimText(item.price, 24)}`;
  }).join('\n');

  return trimText(items, maxLength);
}

function withBannerAndComponents(embed, components = []) {
  const message = attachBanner(embed);

  if (components.length > 0) {
    message.components = components;
  }

  return message;
}

function withoutBanner(embed, components = []) {
  const message = { embeds: [embed] };

  if (components.length > 0) {
    message.components = components;
  }

  return message;
}

function getVisibleCategories(store, includeDrafts = false) {
  return store.categories
    .map((category) => ({
      ...category,
      products: includeDrafts
        ? category.products || []
        : (category.products || []).filter((product) => product.publishedAt)
    }))
    .filter((category) => includeDrafts || category.products.length > 0);
}

function createCategoryOptions(categories) {
  return categories.slice(0, 25).map((category) => ({
    label: trimText(`${category.emoji || '🛍️'} ${category.name}`, 100),
    value: category.id,
    description: trimText(category.description || 'Voir les produits.', 100),
    emoji: '🛍️'
  }));
}

function createProductOptions(products) {
  return products.slice(0, 25).map((product) => ({
    label: trimText(product.name, 100),
    value: product.id,
    description: trimText(`Stock: ${product.stock || 0} • ${product.price}`, 100),
    emoji: '🛍️'
  }));
}

function createOrderProductOptions(products) {
  return products
    .slice(0, 25)
    .map((product) => ({
      label: trimText(product.name, 100),
      value: product.id,
      description: trimText(`Stock: ${product.stock || 0} • ${product.price}`, 100),
      emoji: '🛒'
    }));
}

function buildRulesMessage() {
  const embed = createBaseEmbed('HEXA_HUB RULES', 'HEXA_HUB • RULES')
    .setTitle('📜 RÈGLEMENT OFFICIEL')
    .setDescription([
      '💜 BIENVENUE SUR HEXA_HUB',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '🤝 RESPECT',
      "PAS D'INSULTES",
      'NI DE PROVOCATIONS',
      '',
      '❌ SPAM',
      'PAS DE FLOOD',
      'NI DE MAJUSCULES',
      '',
      '📁 SALONS',
      'UTILISE LE BON',
      'SALON DISCORD',
      '',
      '🚫 PUBLICITÉ',
      'PUBS INTERDITES',
      'EN PUBLIC ET MP',
      '',
      '🛒 BOUTIQUE',
      'AUCUNE ARNAQUE',
      'STAFF OFFICIEL UNIQUEMENT',
      '',
      '🔞 CONTENU',
      'LIENS ILLÉGAUX',
      'ET VIRUS INTERDITS',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️ EN RESTANT ICI',
      'TU ACCEPTES',
      'LE RÈGLEMENT.',
      '📜 RÈGLEMENT OFFICIEL'
    ].join('\n'));

  return attachBanner(embed);
}

function buildWelcomeMessage(member) {
  const rulesChannel = channelMentionByName(member.guild, config.channels.rules, '📜︱reglement');
  const commanderChannel = channelMentionByName(member.guild, config.channels.commander, '💳︱commander');
  const generalChannel = channelMentionByName(member.guild, config.channels.general, '💬︱general');

  const embed = createBaseEmbed('HEXA_HUB WELCOME', 'HEXA_HUB WELCOME')
    .setTitle('💜 BIENVENUE SUR HEXA_HUB')
    .setThumbnail(member.displayAvatarURL({ extension: 'png', size: 256 }))
    .setDescription([
      `✨ BIENVENUE ${member}`,
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📜 RÈGLEMENT',
      rulesChannel,
      '',
      '💳 COMMANDER',
      commanderChannel,
      '',
      '💬 GÉNÉRAL',
      generalChannel,
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '🛒 BON SHOPPING',
      'SUR HEXA_HUB'
    ].join('\n'));

  return attachBanner(embed);
}

function buildUpdateMessage(title, text) {
  const embed = createBaseEmbed('HEXA_HUB UPDATE', 'HEXA_HUB • UPDATE')
    .setTitle(title)
    .setDescription(text);

  return attachBanner(embed);
}

function buildAccountsPanelMessage() {
  const embed = createBaseEmbed('HEXA_HUB ACCOUNTS', 'HEXA_HUB • COMPTES')
    .setTitle('🙋 ESPACE COMPTES')
    .setDescription([
      '💜 CRÉE TON COMPTE HEXA_HUB',
      '',
      '🔐 CONNECTE-TOI',
      'POUR VOIR TON SOLDE ET PRÉPARER LE SHOP.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accounts:create')
      .setLabel('Créer un compte')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('accounts:login')
      .setLabel('Se connecter')
      .setEmoji('🔐')
      .setStyle(ButtonStyle.Primary)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildAccountCreatedAdminMessage(user, member, account, totalAccounts) {
  const displayName = member?.displayName || account.displayName || user.username;

  const embed = createBaseEmbed('HEXA_HUB ADMIN', 'HEXA_HUB • COMPTE CRÉÉ')
    .setTitle('🙋 NOUVEAU COMPTE CRÉÉ')
    .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }))
    .setDescription([
      `👤 MEMBRE: ${user}`,
      `📝 NOM: ${displayName}`,
      `🆔 DISCORD ID: ${user.id}`,
      `📊 TOTAL COMPTES: ${totalAccounts}`,
      `📅 CRÉATION: ${formatDiscordDate(account.createdAt)}`
    ].join('\n'));

  return attachBanner(embed);
}

function buildAccountPrivateMessage(user, account, orders = [], options = {}) {
  const balance = Number(account.balance || 0).toFixed(2);
  const blocked = Boolean(account.shopBlocked);
  const connectionDate = account.lastLoginAt || account.createdAt;
  const recentOrders = orders.length > 0
    ? orders.slice(0, 5).map((order) => [
        `\`\`\`${order.id}\`\`\``,
        formatOrderItems(order, 220),
        `Total: ${trimText(order.totalPrice || order.price, 24)} - ${order.status || 'ordered'}`
      ].join('\n')).join('\n')
    : 'Aucune commande pour le moment.';

  const embed = createBaseEmbed('HEXA_HUB COMPTE', 'HEXA_HUB • COMPTE')
    .setTitle('🙋 ESPACE PRIVÉ HEXA_HUB')
    .setDescription([
      '💜 TON ESPACE CLIENT',
      '',
      'Toutes tes informations HEXA_HUB sont regroupées ici.',
      'Le salon se met à jour quand ton solde ou tes commandes changent.'
    ].filter(Boolean).join('\n'))
    .addFields(
      {
        name: '👤 MEMBRE',
        value: `${user ? `<@${user.id}>` : `<@${account.userId}>`}\nID: ${account.userId}`,
        inline: true
      },
      {
        name: '💰 SOLDE',
        value: `**${balance}€**`,
        inline: true
      },
      {
        name: '📧 SITE',
        value: account.email ? `Email: **${account.email}**` : 'Email non configuré.',
        inline: true
      },
      {
        name: '🛒 BOUTIQUE',
        value: blocked
          ? `**BLOQUÉE**\n${account.shopBlockedReason || 'Aucune raison indiquée.'}`
          : '**ACTIVE**',
        inline: true
      },
      {
        name: '📅 COMPTE',
        value: [
          `Créé: ${formatOptionalDiscordDate(account.createdAt)}`,
          `Dernière connexion: ${formatOptionalDiscordDate(connectionDate)}`
        ].join('\n'),
        inline: false
      },
      {
        name: '🧾 DERNIÈRES COMMANDES',
        value: trimText(recentOrders, 1000),
        inline: false
      }
    );

  if (user?.displayAvatarURL) {
    embed.setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accounts:add-balance-ticket')
      .setLabel('Ajouter du solde')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('accounts:claim-order')
      .setLabel('Réclamer ma commande')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [row];

  if (options.isSeller) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('seller:panel')
        .setLabel(options.isSellerPremium ? 'Panel seller premium' : 'Panel seller')
        .setEmoji('🛍️')
        .setStyle(options.isSellerPremium ? ButtonStyle.Success : ButtonStyle.Secondary)
    ));
  }

  return withoutBanner(embed, rows);
}

function buildOrderClaimTicketMessage(user, order, product, category) {
  const totalQuantity = Number(order.quantity || getOrderItems(order).reduce((total, item) => total + Number(item.quantity || 1), 0));
  const embed = createBaseEmbed('HEXA_HUB COMMANDE', 'HEXA_HUB • RÉCLAMATION')
    .setTitle('📦 RÉCLAMATION DE COMMANDE')
    .setDescription([
      `👤 Client: ${user}`,
      `🧾 ID commande:`,
      `\`\`\`${order.id}\`\`\``,
      `📦 Quantité totale: **${totalQuantity}**`,
      `💳 Total: **${order.totalPrice || order.price}**`,
      '',
      '🛍️ Produits:',
      formatOrderItems(order, 900),
      '',
      'Le staff peut livrer la commande avec le bouton ci-dessous.'
    ].join('\n'));

  if (product?.imageUrl) {
    embed.setImage(product.imageUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`orders:deliver:${order.id}`)
      .setLabel('Livrer la commande')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  return withoutBanner(embed, [row]);
}

function buildDeliveryMessage(order, product, credentials) {
  const rawType = String(credentials.deliveryType || '').toLowerCase();
  const productType = trimText(credentials.productType || credentials.deliveryType || order.productName || 'Produit', 120);
  const quantity = Number.parseInt(String(credentials.quantity || order.quantity || 1), 10) || 1;
  const primaryRaw = credentials.deliveryContent || credentials.primary || credentials.email || '';
  const secondaryRaw = credentials.secondary || credentials.password || '';
  const noteRaw = credentials.note || '';
  const requestRaw = credentials.requestMessage || '';
  const primary = primaryRaw ? trimText(primaryRaw, 1000) : '';
  const secondary = secondaryRaw ? trimText(secondaryRaw, 1000) : '';
  const note = noteRaw ? trimText(noteRaw, 900) : '';
  const requestMessage = requestRaw ? trimText(requestRaw, 900) : '';
  const isInfoRequest = !primary && requestMessage;
  const typeConfig = rawType.includes('lien') || rawType.includes('nitro')
    ? {
        title: '🔗 LIEN DE LIVRAISON',
        primaryLabel: '🔗 Lien',
        secondaryLabel: '🎁 Code / précision'
      }
    : rawType.includes('code') || rawType.includes('service')
      ? {
          title: '🔑 CODES D’ACCÈS',
          primaryLabel: '🔑 Code principal',
          secondaryLabel: '🧩 Code secondaire'
        }
      : rawType.includes('autre') || rawType.includes('info')
        ? {
            title: '📦 INFORMATIONS DE LIVRAISON',
            primaryLabel: '📦 Information',
            secondaryLabel: '🧩 Complément'
          }
        : {
            title: '📧 COMPTE LIVRÉ',
            primaryLabel: '📧 Mail / identifiant',
            secondaryLabel: '🔐 Mot de passe'
          };

  const deliveryLines = [];

  if (primary) {
    deliveryLines.push(typeConfig.primaryLabel, `\`\`\`${primary}\`\`\``);
  }

  if (secondary) {
    deliveryLines.push(typeConfig.secondaryLabel, `\`\`\`${secondary}\`\`\``);
  }

  if (note) {
    deliveryLines.push('📝 Message', `\`\`\`${note}\`\`\``);
  }

  if (requestMessage) {
    deliveryLines.push('📩 Demande au client', `\`\`\`${requestMessage}\`\`\``);
  }

  const embed = createBaseEmbed('HEXA_HUB DELIVERY', 'HEXA_HUB • LIVRAISON')
    .setTitle(isInfoRequest ? '📩 INFORMATIONS DEMANDÉES' : '✅ COMMANDE LIVRÉE')
    .setDescription([
      isInfoRequest ? '💜 LE STAFF A BESOIN D’UNE INFORMATION.' : '💜 TA COMMANDE EST PRÊTE.',
      '',
      `🧾 ID commande:`,
      `\`\`\`${order.id}\`\`\``,
      `🛍️ Type: **${productType}**`,
      `📦 Quantité: **${quantity}**`,
      '',
      isInfoRequest ? '📩 DEMANDE' : typeConfig.title,
      ...deliveryLines,
      '',
      isInfoRequest
        ? 'Réponds directement dans ce ticket avec les informations demandées.'
        : '⚠️ Garde ces informations privées.'
    ].join('\n'));

  if (product?.imageUrl) {
    embed.setImage(product.imageUrl);
  }

  return withoutBanner(embed);
}

function buildOrderLogMessage(order, product) {
  const embed = createBaseEmbed('HEXA_HUB COMMANDES', 'HEXA_HUB • COMMANDES')
    .setTitle('🛒 NOUVELLE COMMANDE')
    .setDescription([
      `👤 Client: <@${order.user.id}>`,
      `🧾 ID commande:`,
      `\`\`\`${order.id}\`\`\``,
      `📦 Quantité: **${order.quantity || 1}**`,
      `💳 Total: **${order.totalPrice || order.price}**`,
      '',
      '🛍️ Produits:',
      formatOrderItems(order, 900),
      '',
      `🌐 Source: **${order.source || 'discord'}**`,
      order.customerNote ? `📝 Note: **${trimText(order.customerNote, 250)}**` : null,
      `📦 Livraison: **${order.deliveryStatus || 'pending'}**`
    ].filter(Boolean).join('\n'));

  if (product?.imageUrl) {
    embed.setImage(product.imageUrl);
  }

  return withoutBanner(embed);
}

function buildRevenueStatsMessage(stats) {
  const topProducts = stats.topProducts.length > 0
    ? stats.topProducts.map((product) =>
        `• ${trimText(product.name, 45)} — ${product.count} vente(s) — ${product.revenue.toFixed(2)}€`
      ).join('\n')
    : 'Aucun produit vendu pour le moment.';

  const embed = createBaseEmbed('HEXA_HUB RÉSULTATS', 'HEXA_HUB • RÉSULTATS')
    .setTitle('📊 RÉSULTATS BOUTIQUE')
    .setDescription([
      `💰 Argent généré: **${stats.totalRevenue.toFixed(2)}€**`,
      `🛒 Commandes: **${stats.totalOrders}**`,
      `✅ Livrées: **${stats.delivered}**`,
      `⏳ En attente: **${stats.pendingDelivery}**`
    ].join('\n'))
    .addFields({
      name: '🏆 TOP PRODUITS',
      value: trimText(topProducts, 1000),
      inline: false
    });

  return withoutBanner(embed);
}

function buildShopStatusMessage(isOpen) {
  const status = isOpen
    ? {
        emoji: '🟢',
        title: 'BOUTIQUE OUVERTE',
        sentence: 'LA BOUTIQUE EST ACTUELLEMENT OUVERTE.',
        orders: 'COMMANDES OUVERTES',
        shop: 'BOUTIQUE ACTUELLEMENT ONLINE',
        advice: 'TU PEUX COMMANDER.'
      }
    : {
        emoji: '🔴',
        title: 'BOUTIQUE FERMÉE',
        sentence: 'LA BOUTIQUE EST ACTUELLEMENT FERMÉE.',
        orders: 'COMMANDES SUSPENDUES',
        shop: 'BOUTIQUE TEMPORAIREMENT OFFLINE',
        advice: 'REPASSE PLUS TARD.'
      };

  const embed = createBaseEmbed('HEXA_HUB SHOP', 'HEXA_HUB • SHOP')
    .setTitle(`${status.emoji} ${status.title}`)
    .setDescription([
      `💜 ${status.sentence}`,
      '',
      `💳 ${status.orders}`,
      `🛒 ${status.shop}`,
      '',
      `⚠️ ${status.advice}`,
      `${status.emoji} ${status.title}`
    ].join('\n'));

  return attachBanner(embed);
}

function buildCataloguePublicMessage(store, options = {}) {
  const visibleCategories = getVisibleCategories(store, options.includeDrafts);
  const categoryCount = visibleCategories.length;
  const productCount = visibleCategories.reduce((total, category) => total + (category.products?.length || 0), 0);

  const embed = createBaseEmbed('HEXA_HUB ORDER', 'HEXA_HUB • ORDER')
    .setTitle('💳 COMMANDER UN PRODUIT')
    .setDescription([
      '🛍️ CHOISIS UNE CATÉGORIE',
      'DANS LE MENU CI-DESSOUS.',
      '',
      '⚡ STOCK LIVE',
      '🔒 ACHAT SÉCURISÉ',
      '💜 LIVRAISON RAPIDE',
      '💳 COMMANDER UN PRODUIT',
      '',
      `📦 ${categoryCount} CATÉGORIE(S)`,
      `🛍️ ${productCount} PRODUIT(S)`
    ].join('\n'));

  const selectOptions = createCategoryOptions(visibleCategories);
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(options.categorySelectCustomId || 'catalogue:category')
      .setPlaceholder(categoryCount > 0 ? 'Choisis une catégorie' : 'Aucune catégorie disponible')
      .setDisabled(categoryCount === 0)
      .addOptions(selectOptions.length > 0 ? selectOptions : [{ label: 'Aucune catégorie', value: 'empty', description: 'Publie des produits côté admin.' }])
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue:cart')
      .setLabel('Panier')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('catalogue:refresh')
      .setLabel('Actualiser')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('catalogue:login')
      .setLabel('Se connecter')
      .setEmoji('🔐')
      .setStyle(ButtonStyle.Success)
  );

  return withBannerAndComponents(embed, [selectRow, buttonRow]);
}

function buildCatalogueCategoryMessage(category, options = {}) {
  const products = options.includeDrafts
    ? category.products || []
    : (category.products || []).filter((product) => product.publishedAt);

  const categoryEmbed = createBaseEmbed('HEXA_HUB CATALOGUE', 'HEXA_HUB • CATÉGORIE')
    .setTitle(`${category.emoji || '🛍️'} ${category.name}`)
    .setDescription([
      '━━━━━━━━━━━━━━━━━━',
      category.description || 'Produits disponibles dans cette catégorie.',
      '',
      `📦 ${products.length} PRODUIT(S)`
    ].join('\n'));

  if (products.length === 0) {
    categoryEmbed.addFields({ name: '📦 PRODUITS', value: 'Aucun produit pour le moment.', inline: false });
    return withoutBanner(categoryEmbed);
  }

  const productEmbeds = products.slice(0, 9).map((product) => {
    const stock = Number(product.stock || 0);
    const productEmbed = createBaseEmbed('HEXA_HUB PRODUIT', 'HEXA_HUB • PRODUIT')
      .setTitle(`🛍️ ${trimText(product.name, 120)}`)
      .setDescription([
        `💳 Prix: **${trimText(product.price, 40)}**`,
        `📦 Stock: **${stock}** ${stock <= 0 ? '• RUPTURE' : '• DISPONIBLE'}`,
        '',
        trimText(product.description, 700)
      ].join('\n'));

    if (product.imageUrl) {
      productEmbed.setImage(product.imageUrl);
    }

    return productEmbed;
  });

  if (products.length > 9) {
    categoryEmbed.addFields({
      name: '➕ AUTRES PRODUITS',
      value: `${products.length - 9} produit(s) supplémentaire(s). Discord limite cette vue à 10 embeds.`,
      inline: false
    });
  }

  if (options.showOrderSelect === false) {
    return { embeds: [categoryEmbed, ...productEmbeds] };
  }

  const orderOptions = createOrderProductOptions(products);
  const productSelect = new StringSelectMenuBuilder()
    .setCustomId(options.productSelectCustomId || 'catalogue:product')
    .setPlaceholder(orderOptions.length > 0 ? 'Choisis un ou plusieurs produits' : 'Aucun produit disponible')
    .setDisabled(orderOptions.length === 0);

  if (orderOptions.length > 0) {
    productSelect
      .setMinValues(1)
      .setMaxValues(Math.min(orderOptions.length, 25))
      .addOptions(orderOptions);
  } else {
    productSelect.addOptions([{ label: 'Aucun produit', value: 'empty', description: 'Aucun produit commandable.' }]);
  }

  const row = new ActionRowBuilder().addComponents(productSelect);

  return {
    embeds: [categoryEmbed, ...productEmbeds],
    components: [row]
  };
}

function buildProductOrderMessage(product, category) {
  const stock = Number(product.stock || 0);
  const embed = createBaseEmbed('HEXA_HUB ORDER', 'HEXA_HUB • PRODUIT')
    .setTitle(`🛒 ${product.name}`)
    .setDescription([
      `📁 Catégorie: **${category.name}**`,
      `💳 Prix: **${product.price}**`,
      `📦 Stock: **${stock}**`,
      '',
      stock > 0
        ? '✅ CE PRODUIT EST DISPONIBLE.'
        : '❌ CE PRODUIT EST EN RUPTURE DE STOCK.'
    ].join('\n'));

  if (product.imageUrl) {
    embed.setImage(product.imageUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`catalogue:add-cart:${product.id}`)
      .setLabel(stock > 0 ? 'Ajouter au panier' : 'Rupture de stock')
      .setEmoji(stock > 0 ? '🛒' : '❌')
      .setStyle(stock > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(stock <= 0)
  );

  return withoutBanner(embed, [row]);
}

function buildAddedToCartMessage(addedItems, account) {
  const items = Array.isArray(addedItems) ? addedItems : [addedItems];
  const addedLines = items.map((item) =>
    `• x${item.quantity || 1} **${item.product.name}** - ${item.product.price}`
  ).join('\n');
  const cartCount = Array.isArray(account?.cartItems)
    ? account.cartItems.reduce((total, item) => total + Number(item.quantity || 1), 0)
    : null;
  const embed = createBaseEmbed('HEXA_HUB PANIER', 'HEXA_HUB • PANIER')
    .setTitle('🛒 AJOUTÉ AU PANIER')
    .setDescription([
      addedLines,
      '',
      cartCount ? `Panier actuel: **${cartCount} article(s)**` : null,
      'Clique sur **Panier** pour confirmer la commande.'
    ].filter(Boolean).join('\n'));

  const itemWithImage = items.find((item) => item.product?.imageUrl);
  if (itemWithImage?.product?.imageUrl) {
    embed.setImage(itemWithImage.product.imageUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue:cart')
      .setLabel('Voir le panier')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('catalogue:cart-clear')
      .setLabel('Retirer')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );

  return withoutBanner(embed, [row]);
}

function buildCartMessage(cartItems, account) {
  const balance = Number(account.balance || 0);
  const total = cartItems.reduce((sum, item) =>
    sum + parsePrice(item.product.price) * Number(item.quantity || 1), 0);
  const hasStockIssue = cartItems.some((item) => Number(item.product.stock || 0) < Number(item.quantity || 1));
  const hasPriceIssue = cartItems.some((item) => parsePrice(item.product.price) <= 0);
  const hasBalanceIssue = balance < total;
  const lines = cartItems.length > 0
    ? cartItems.map((item) => {
        const quantity = Number(item.quantity || 1);
        const lineTotal = parsePrice(item.product.price) * quantity;
        const stock = Number(item.product.stock || 0);
        const status = stock >= quantity ? '✅' : '❌ STOCK';

        return [
          `• x${quantity} **${trimText(item.product.name, 55)}**`,
          `  ${trimText(item.category.name, 45)} • ${item.product.price} • ${formatMoney(lineTotal)} • Stock ${stock} ${status}`
        ].join('\n');
      }).join('\n')
    : 'Ton panier est vide.';
  const embed = createBaseEmbed('HEXA_HUB PANIER', 'HEXA_HUB • PANIER')
    .setTitle('🛒 TON PANIER')
    .setDescription([
      lines,
      '',
      `Total: **${formatMoney(total)}**`,
      `Solde: **${formatMoney(balance)}**`,
      '',
      hasStockIssue
        ? '❌ Un ou plusieurs produits n’ont pas assez de stock.'
        : hasPriceIssue
          ? '❌ Un produit a un prix invalide. Contacte le staff.'
          : hasBalanceIssue
            ? '❌ Solde insuffisant pour commander ce panier.'
            : '✅ Tu peux commander ce panier.'
    ].join('\n'));

  const itemWithImage = cartItems.find((item) => item.product?.imageUrl);
  if (itemWithImage?.product?.imageUrl) {
    embed.setImage(itemWithImage.product.imageUrl);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue:order-cart')
      .setLabel('Commander le panier')
      .setEmoji('💳')
      .setStyle(ButtonStyle.Success)
      .setDisabled(cartItems.length === 0 || hasStockIssue || hasPriceIssue || hasBalanceIssue),
    new ButtonBuilder()
      .setCustomId('catalogue:cart-clear')
      .setLabel('Vider le panier')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );

  return withoutBanner(embed, [row]);
}

function buildCatalogueAdminMessage(store) {
  const categoryCount = store.categories.length;
  const productCount = store.categories.reduce((total, category) => total + (category.products?.length || 0), 0);
  const pendingRestock = store.categories.reduce((total, category) =>
    total + (category.products || []).filter((product) => !product.publishedAt || (product.pendingRestockQuantity || 0) > 0).length, 0);

  const embed = createBaseEmbed('HEXA_HUB ADMIN', 'HEXA_HUB • CATALOGUE ADMIN')
    .setTitle('🛍️ GESTION DU CATALOGUE')
    .setDescription([
      '💜 PANEL ADMIN CATALOGUE',
      '',
      `📦 CATÉGORIES: ${categoryCount}`,
      `🛍️ PRODUITS: ${productCount}`,
      `📣 À PUBLIER: ${pendingRestock}`,
      '',
      'AJOUTE, MODIFIE, SUPPRIME ET GÈRE LE STOCK',
      'PUIS CLIQUE SUR PUBLIER.'
    ].join('\n'));

  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue-admin:add-category')
      .setLabel('Ajouter catégorie')
      .setEmoji('📁')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:edit-category')
      .setLabel('Modifier catégorie')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:delete-category')
      .setLabel('Supprimer catégorie')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue-admin:add-product')
      .setLabel('Ajouter produit')
      .setEmoji('🛍️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:edit-product')
      .setLabel('Modifier produit')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:delete-product')
      .setLabel('Supprimer produit')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:stock-product')
      .setLabel('Modifier stock')
      .setEmoji('📦')
      .setStyle(ButtonStyle.Secondary)
  );

  const rowThree = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('catalogue-admin:preview')
      .setLabel('Aperçu privé')
      .setEmoji('👁️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:refresh')
      .setLabel('Actualiser')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('catalogue-admin:publish')
      .setLabel('Publier')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Primary)
  );

  return withBannerAndComponents(embed, [rowOne, rowTwo, rowThree]);
}

function buildAdminCategorySelectMessage(store, action) {
  const labels = {
    addProduct: {
      title: '🛍️ AJOUTER UN PRODUIT',
      description: 'Sélectionne la catégorie où ajouter le produit.',
      customId: 'catalogue-admin:select-category:add-product',
      placeholder: 'Choisis la catégorie'
    },
    deleteCategory: {
      title: '🗑️ SUPPRIMER UNE CATÉGORIE',
      description: 'Sélectionne la catégorie à supprimer.',
      customId: 'catalogue-admin:select-category:delete',
      placeholder: 'Choisis la catégorie à supprimer'
    },
    editCategory: {
      title: '✏️ MODIFIER UNE CATÉGORIE',
      description: 'Sélectionne la catégorie à modifier.',
      customId: 'catalogue-admin:select-category:edit',
      placeholder: 'Choisis la catégorie à modifier'
    }
  };

  const categoryOptions = createCategoryOptions(store.categories);
  const embed = createBaseEmbed('HEXA_HUB ADMIN', 'HEXA_HUB • CATALOGUE ADMIN')
    .setTitle(labels[action].title)
    .setDescription(labels[action].description);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(labels[action].customId)
      .setPlaceholder(labels[action].placeholder)
      .setDisabled(categoryOptions.length === 0)
      .addOptions(categoryOptions.length > 0 ? categoryOptions : [{ label: 'Aucune catégorie', value: 'empty', description: 'Ajoute une catégorie avant.' }])
  );

  return withoutBanner(embed, [row]);
}

function buildAdminProductSelectMessage(store, action = 'stockProduct') {
  const labels = {
    stockProduct: {
      title: '📦 MODIFIER LE STOCK',
      description: 'Sélectionne le produit auquel tu veux ajouter ou retirer du stock.',
      customId: 'catalogue-admin:select-product:stock',
      placeholder: 'Choisis le produit'
    },
    editProduct: {
      title: '✏️ MODIFIER UN PRODUIT',
      description: 'Sélectionne le produit à modifier.',
      customId: 'catalogue-admin:select-product:edit',
      placeholder: 'Choisis le produit à modifier'
    },
    deleteProduct: {
      title: '🗑️ SUPPRIMER UN PRODUIT',
      description: 'Sélectionne le produit à supprimer.',
      customId: 'catalogue-admin:select-product:delete',
      placeholder: 'Choisis le produit à supprimer'
    }
  };
  const label = labels[action] || labels.stockProduct;
  const products = store.categories.flatMap((category) =>
    (category.products || []).map((product) => ({
      ...product,
      categoryName: category.name
    }))
  );

  const productOptions = createProductOptions(products);
  const embed = createBaseEmbed('HEXA_HUB ADMIN', 'HEXA_HUB • CATALOGUE ADMIN')
    .setTitle(label.title)
    .setDescription(label.description);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(label.customId)
      .setPlaceholder(label.placeholder)
      .setDisabled(productOptions.length === 0)
      .addOptions(productOptions.length > 0 ? productOptions : [{ label: 'Aucun produit', value: 'empty', description: 'Ajoute un produit avant.' }])
  );

  return withoutBanner(embed, [row]);
}

function buildRestockMessage(products) {
  const hasNewProducts = products.some((product) => product.reason === 'new');
  const hasStockUpdate = products.some((product) => product.reason === 'stock');
  const title = hasNewProducts && hasStockUpdate
    ? '🛍️ NOUVEAUX PRODUITS & RESTOCK'
    : hasStockUpdate
      ? '📦 RESTOCK HEXA_HUB'
      : '🛍️ NOUVEAUX PRODUITS';

  const embed = createBaseEmbed('HEXA_HUB RESTOCK', 'HEXA_HUB • RESTOCK')
    .setTitle(title)
    .setDescription('💜 LE CATALOGUE VIENT D’ÊTRE MIS À JOUR.');

  if (!products || products.length === 0) {
    embed.addFields({ name: '📦 PRODUITS', value: 'Aucun produit listé.', inline: false });
    return withoutBanner(embed);
  }

  for (const product of products.slice(0, 9)) {
    const stockLine = product.reason === 'stock'
      ? `Stock ajouté: **+${product.pendingRestockQuantity || 0}**`
      : `Stock: **${product.stock || 0}**`;

    embed.addFields({
      name: `${product.categoryEmoji || '🛍️'} ${trimText(product.name, 70)}`,
      value: [
        `Catégorie: **${trimText(product.categoryName, 60)}**`,
        `Prix: **${trimText(product.price, 40)}**`,
        stockLine
      ].join('\n'),
      inline: true
    });
  }

  const productWithImage = products.find((product) => product.imageUrl);
  if (productWithImage?.imageUrl) {
    embed.setImage(productWithImage.imageUrl);
  }

  return withoutBanner(embed);
}

function buildBecomeSellerMessage() {
  const embed = createBaseEmbed('HEXA_HUB SELLER', 'HEXA_HUB • SELLER SYSTEM')
    .setTitle('❓ DEVENIR SELLER HEXA_HUB')
    .setDescription([
      '💜 TU VEUX VENDRE TES PROPRES PRODUITS ?',
      '',
      'HEXA_HUB PEUT AFFICHER TES PRODUITS',
      'DANS UN CATALOGUE SELLER SÉPARÉ.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '🛍️ SELLER SIMPLE',
      '10€ PAR PRODUIT VALIDÉ',
      'TES PRODUITS SONT AFFICHÉS',
      'DANS LE CATALOGUE SELLER.',
      '',
      '💎 SELLER PREMIUM',
      '30€ POUR TA PROPRE CATÉGORIE',
      'TU PEUX Y METTRE AUTANT',
      'DE PRODUITS QUE TU VEUX.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📋 POUR POSTULER',
      'CLIQUE SUR LE BOUTON',
      'ET DONNE LES INFORMATIONS DEMANDÉES.',
      '',
      '⚠️ LE STAFF VALIDE OU REFUSE',
      'CHAQUE DEMANDE ET CHAQUE PRODUIT.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('seller:apply')
      .setLabel('Faire une demande')
      .setEmoji('🛍️')
      .setStyle(ButtonStyle.Success)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildSellerApplicationReviewMessage(application) {
  const embed = createBaseEmbed('HEXA_HUB SELLER ADMIN', 'HEXA_HUB • SELLER VERIFY')
    .setTitle('🛍️ DEMANDE SELLER À VÉRIFIER')
    .setDescription([
      `👤 Membre: <@${application.user.id}>`,
      `🧾 ID: **${application.id}**`,
      `💼 Formule demandée: **${application.plan === 'premium' ? 'Premium' : 'Simple'}**`,
      '',
      `🏷️ Nom boutique: **${trimText(application.shopName, 120)}**`,
      '',
      '📦 Produits prévus',
      trimText(application.products, 900),
      '',
      '🧠 Expérience / détails',
      trimText(application.experience, 700),
      '',
      '📩 Contact',
      trimText(application.contact, 300)
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`seller-app:approve-standard:${application.id}`)
      .setLabel('Valider seller')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`seller-app:approve-premium:${application.id}`)
      .setLabel('Valider premium')
      .setEmoji('💎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`seller-app:reject:${application.id}`)
      .setLabel('Refuser')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildSellerCataloguePublicMessage(store) {
  const categories = store.categories || [];
  const productCount = categories.reduce((total, category) => total + (category.products?.length || 0), 0);
  const embed = createBaseEmbed('HEXA_HUB SELLERS', 'HEXA_HUB • SELLER CATALOGUE')
    .setTitle('🛍️ SELLER CATALOGUE')
    .setDescription([
      '💜 PRODUITS DES SELLERS VALIDÉS',
      '',
      'CHOISIS UNE CATÉGORIE',
      'DANS LE MENU CI-DESSOUS.',
      '',
      '⚡ STOCK LIVE',
      '🔒 SELLERS VÉRIFIÉS',
      '💜 CATALOGUE HEXA_HUB',
      '',
      `📦 ${categories.length} CATÉGORIE(S)`,
      `🛍️ ${productCount} PRODUIT(S)`
    ].join('\n'));

  const options = categories.slice(0, 25).map((category) => ({
    label: trimText(`${category.emoji || '🛍️'} ${category.name}`, 100),
    value: category.id,
    description: trimText(category.description || 'Voir les produits.', 100),
    emoji: '🛍️'
  }));
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('seller-catalogue:category')
      .setPlaceholder(options.length > 0 ? 'Choisis une catégorie seller' : 'Aucun produit seller')
      .setDisabled(options.length === 0)
      .addOptions(options.length > 0 ? options : [{ label: 'Aucun produit', value: 'empty', description: 'Aucun produit seller validé.' }])
  );
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('seller-catalogue:refresh')
      .setLabel('Actualiser')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary)
  );

  return withBannerAndComponents(embed, [selectRow, buttonRow]);
}

function buildSellerCatalogueCategoryMessage(category) {
  const categoryEmbed = createBaseEmbed('HEXA_HUB SELLERS', 'HEXA_HUB • SELLER CATEGORY')
    .setTitle(`${category.emoji || '🛍️'} ${category.name}`)
    .setDescription([
      '━━━━━━━━━━━━━━━━━━',
      category.description || 'Produits disponibles dans cette catégorie.',
      '',
      `📦 ${category.products.length} PRODUIT(S)`
    ].join('\n'));
  const productEmbeds = category.products.slice(0, 9).map((product) => {
    const stock = Number(product.stock || 0);
    const embed = createBaseEmbed('HEXA_HUB SELLER PRODUCT', 'HEXA_HUB • SELLER PRODUCT')
      .setTitle(`🛍️ ${trimText(product.name, 120)}`)
      .setDescription([
        `👤 Seller: **${trimText(product.sellerName || product.ownerName, 80)}**`,
        `💳 Prix: **${trimText(product.price, 40)}**`,
        `📦 Stock: **${stock}** ${stock <= 0 ? '• RUPTURE' : '• DISPONIBLE'}`,
        '',
        trimText(product.description, 700)
      ].join('\n'));

    if (product.imageUrl) embed.setImage(product.imageUrl);
    return embed;
  });

  return { embeds: [categoryEmbed, ...productEmbeds] };
}

function buildSellerPanelMessage(seller, isPremium = false) {
  const products = seller.products || [];
  const approved = products.filter((product) => product.status === 'approved').length;
  const pending = products.filter((product) => product.status === 'pending').length;
  const drafts = products.filter((product) => ['draft', 'rejected'].includes(product.status)).length;
  const embed = createBaseEmbed('HEXA_HUB SELLER', 'HEXA_HUB • SELLER PANEL')
    .setTitle(isPremium ? '💎 PANEL SELLER PREMIUM' : '🛍️ PANEL SELLER')
    .setDescription([
      `👤 Seller: **${seller.displayName || seller.username}**`,
      `💼 Statut: **${isPremium ? 'Premium' : 'Simple'}**`,
      '',
      `✅ Validés: **${approved}**`,
      `⏳ En vérification: **${pending}**`,
      `📝 Brouillons / à soumettre: **${drafts}**`,
      '',
      'AJOUTE TES PRODUITS, MODIFIE TON STOCK,',
      'PUIS SOUMETS AU STAFF POUR VALIDATION.'
    ].join('\n'));
  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('seller:add-product').setLabel('Ajouter produit').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('seller:view').setLabel('Voir catalogue').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('seller:edit-product').setLabel('Modifier produit').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('seller:stock-product').setLabel('Modifier stock').setEmoji('📦').setStyle(ButtonStyle.Secondary)
  );
  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('seller:submit').setLabel('Soumettre au staff').setEmoji('📨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('seller:refresh').setLabel('Actualiser').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
  );

  if (isPremium) {
    rowTwo.addComponents(
      new ButtonBuilder().setCustomId('seller:edit-category').setLabel('Modifier catégorie').setEmoji('💎').setStyle(ButtonStyle.Success)
    );
  }

  return withBannerAndComponents(embed, [rowOne, rowTwo]);
}

function buildSellerOwnCatalogueMessage(seller) {
  const products = seller.products || [];
  const embed = createBaseEmbed('HEXA_HUB SELLER', 'HEXA_HUB • MES PRODUITS')
    .setTitle('🛍️ MES PRODUITS SELLER')
    .setDescription(products.length > 0
      ? products.slice(0, 10).map((product) => [
          `**${trimText(product.name, 70)}**`,
          `Statut: **${product.status}** • Stock: **${product.stock || 0}** • Prix: **${product.price}**`
        ].join('\n')).join('\n\n')
      : 'Aucun produit pour le moment.');

  return withoutBanner(embed);
}

function buildSellerProductSelectMessage(seller, action) {
  const labels = {
    edit: {
      title: '✏️ MODIFIER UN PRODUIT',
      customId: 'seller:select-product:edit',
      placeholder: 'Choisis le produit à modifier'
    },
    stock: {
      title: '📦 MODIFIER LE STOCK',
      customId: 'seller:select-product:stock',
      placeholder: 'Choisis le produit'
    }
  };
  const label = labels[action] || labels.edit;
  const options = (seller.products || []).slice(0, 25).map((product) => ({
    label: trimText(product.name, 100),
    value: product.id,
    description: trimText(`Stock: ${product.stock || 0} • ${product.status}`, 100),
    emoji: '🛍️'
  }));
  const embed = createBaseEmbed('HEXA_HUB SELLER', 'HEXA_HUB • SELLER SELECT')
    .setTitle(label.title)
    .setDescription('Sélectionne un de tes produits.');
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(label.customId)
      .setPlaceholder(label.placeholder)
      .setDisabled(options.length === 0)
      .addOptions(options.length > 0 ? options : [{ label: 'Aucun produit', value: 'empty', description: 'Ajoute un produit avant.' }])
  );

  return withoutBanner(embed, [row]);
}

function buildSellerSubmissionReviewMessage(seller, products) {
  const embed = createBaseEmbed('HEXA_HUB SELLER ADMIN', 'HEXA_HUB • SELLER PRODUCTS')
    .setTitle('📨 PRODUITS SELLER À VALIDER')
    .setDescription([
      `👤 Seller: <@${seller.userId}>`,
      `💼 Statut: **${seller.tier === 'premium' ? 'Premium' : 'Simple'}**`,
      '',
      products.length > 0
        ? products.slice(0, 8).map((product) => [
            `**${trimText(product.name, 70)}**`,
            `Prix: **${product.price}** • Stock: **${product.stock || 0}**`,
            trimText(product.description, 180)
          ].join('\n')).join('\n\n')
        : 'Aucun produit soumis.'
    ].join('\n'));

  const productWithImage = products.find((product) => product.imageUrl);
  if (productWithImage?.imageUrl) embed.setImage(productWithImage.imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`seller-product:approve:${seller.userId}`).setLabel('Valider produits').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`seller-product:reject:${seller.userId}`).setLabel('Refuser produits').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );

  return withBannerAndComponents(embed, [row]);
}

function stars(rating) {
  return '⭐'.repeat(rating);
}

function buildVouchPanelMessage(stats) {
  const embed = createBaseEmbed('HEXA VOUCH', 'HEXA VOUCH')
    .setTitle('✨ HEXA VOUCH')
    .setDescription([
      '💜 VOS RETOURS SONT PRÉCIEUX',
      '',
      "VOUS VENEZ D'EFFECTUER UN ACHAT ?",
      '',
      'LAISSEZ UN AVIS POUR PARTAGER',
      'VOTRE EXPÉRIENCE ET AIDER',
      'LA COMMUNAUTÉ À GRANDIR.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️ IMPORTANT',
      'EN CAS DE PROBLÈME,',
      'OUVREZ UN TICKET.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📊 TOTAL VOUCHS',
      String(stats.total),
      '',
      '⭐ NOTE MOYENNE',
      `${stats.average.toFixed(1)}/5`,
      '',
      `⭐⭐⭐⭐⭐ — ${stats.counts[5]} AVIS`,
      `⭐⭐⭐⭐ — ${stats.counts[4]} AVIS`,
      `⭐⭐⭐ — ${stats.counts[3]} AVIS`,
      `⭐⭐ — ${stats.counts[2]} AVIS`,
      `⭐ — ${stats.counts[1]} AVIS`,
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '💜 HEXA_HUB STORE',
      '✨ HEXA VOUCH'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vouch:open')
      .setLabel('Poster un avis')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Primary)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildVouchOrderSelectMessage(orders) {
  const embed = createBaseEmbed('HEXA VOUCH', 'HEXA_HUB • VOUCH ORDER')
    .setTitle('⭐ CHOISIS TA COMMANDE')
    .setDescription([
      'Sélectionne le produit commandé',
      'sur lequel tu veux poster un avis.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vouch:select-order')
      .setPlaceholder('Choisis une commande')
      .addOptions(
        orders.slice(0, 25).map((order) => ({
          label: trimText(order.productName, 100),
          value: order.id,
          description: trimText(`${order.id} • ${order.price}`, 100),
          emoji: '🛍️'
        }))
      )
  );

  return withoutBanner(embed, [row]);
}

function buildVouchVerifyMessage(vouch) {
  const embed = createBaseEmbed('HEXA VOUCH ADMIN', 'HEXA_HUB • VOUCH VERIFY')
    .setTitle('⭐ VOUCH À VÉRIFIER')
    .setDescription([
      `👤 Membre: <@${vouch.user.id}>`,
      `🛍️ Produit: **${vouch.order.productName}**`,
      `🧾 ID commande: **${vouch.order.id}**`,
      `💳 Prix: **${vouch.order.price}**`,
      `⭐ Note: ${stars(vouch.rating)} (${vouch.rating}/5)`,
      '',
      '📝 Avis',
      trimText(vouch.description, 1000)
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vouch:approve:${vouch.id}`)
      .setLabel('Valider')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`vouch:reject:${vouch.id}`)
      .setLabel('Refuser')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildVouchPublicMessage(vouch) {
  const embed = createBaseEmbed('HEXA VOUCH', 'HEXA_HUB • VOUCH CLIENT')
    .setTitle('⭐ NOUVEL AVIS CLIENT')
    .setDescription([
      `👤 Client: <@${vouch.user.id}>`,
      `🛍️ Produit: **${vouch.order.productName}**`,
      `🧾 Commande: **${vouch.order.id}**`,
      `⭐ Note: ${stars(vouch.rating)} (${vouch.rating}/5)`,
      '',
      '📝 Avis',
      trimText(vouch.description, 1000)
    ].join('\n'));

  return attachBanner(embed);
}

function buildSupportPanelMessage() {
  const embed = createBaseEmbed('🎟️ SUPPORT OFFICIEL HEXA_HUB', 'HEXA_HUB • SUPPORT SYSTEM')
    .setTitle('🎟️ SUPPORT OFFICIEL HEXA_HUB')
    .setDescription([
      "💜 BESOIN D'AIDE ?",
      'OUVRE UN TICKET',
      'EN CHOISISSANT',
      'LE BON SUPPORT.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '💳 ACHAT',
      'PROBLÈME DE PAIEMENT',
      'OU DE SOLDE',
      '',
      '🛒 COMMANDE',
      'COMMANDE IMPOSSIBLE',
      'OU BLOQUÉE',
      '',
      '🐞 BUG',
      'ERREUR TECHNIQUE',
      'OU PROBLÈME DISCORD',
      '',
      '📦 PRODUIT',
      'PRODUIT NON REÇU',
      'OU DÉFECTUEUX',
      '',
      '❓ AUTRE',
      'QUESTION GÉNÉRALE',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '⚠️ SUPPORT RAPIDE',
      'UN MEMBRE DU STAFF',
      'TE RÉPONDRA RAPIDEMENT.',
      '🎟️ SUPPORT OFFICIEL HEXA_HUB'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('support:open')
      .setPlaceholder('Choisis le type de support')
      .addOptions(
        { label: 'Paiement ou solde', value: 'achat', description: 'Problème de paiement ou de solde', emoji: '💳' },
        { label: 'Commande bloquée', value: 'commande', description: 'Commande impossible ou bloquée', emoji: '🛒' },
        { label: 'Erreur technique', value: 'bug', description: 'Bug Discord ou problème technique', emoji: '🐞' },
        { label: 'Produit non reçu', value: 'produit', description: 'Produit non reçu ou défectueux', emoji: '📦' },
        { label: 'Question générale', value: 'autre', description: 'Autre demande', emoji: '❓' }
      )
  );

  return withBannerAndComponents(embed, [row]);
}

function buildSupportTicketMessage(user, supportType) {
  const labels = {
    solde: '💰 Ajout de solde',
    achat: '💳 Achat / paiement / solde',
    commande: '🛒 Commande bloquée',
    bug: '🐞 Erreur technique',
    produit: '📦 Produit non reçu',
    autre: '❓ Question générale'
  };
  const instructions = {
    solde: [
      'Merci d’envoyer :',
      '• le montant que tu veux ajouter',
      '• une preuve du paiement envoyé',
      '• l’ID de transaction',
      '• le moyen de paiement utilisé',
      '• ton pseudo Discord'
    ],
    achat: [
      'Merci d’envoyer :',
      '• ton ID de commande',
      '• une capture du paiement',
      '• une capture de ton solde si le problème concerne le solde',
      '• le pseudo Discord utilisé pendant l’achat'
    ],
    commande: [
      'Merci d’envoyer :',
      '• ton ID de commande',
      '• des captures de l’erreur ou du blocage',
      '• le produit commandé',
      '• l’heure approximative de la commande'
    ],
    bug: [
      'Merci d’envoyer :',
      '• une capture d’écran ou une vidéo de l’erreur',
      '• le salon ou la commande concernée',
      '• ce que tu faisais juste avant le bug',
      '• ton appareil si utile'
    ],
    produit: [
      'Merci d’envoyer :',
      '• ton ID de commande',
      '• une capture du paiement',
      '• le produit acheté',
      '• une capture de l’onglet “mes comptes” montrant que le compte commandé n’apparaît pas'
    ],
    autre: [
      'Explique ta question avec le plus de détails possible.',
      'Le staff te répondra dès que possible.'
    ]
  };

  const embed = createBaseEmbed('HEXA_HUB SUPPORT', 'HEXA_HUB • TICKET')
    .setTitle('🎟️ TICKET SUPPORT')
    .setDescription([
      `👤 Membre: ${user}`,
      `📌 Type: **${labels[supportType] || labels.autre}**`,
      '',
      ...(instructions[supportType] || instructions.autre),
      '',
      '⚠️ Plus tu donnes d’informations, plus le support sera rapide.'
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('support:close')
      .setLabel('Fermer le ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  return withBannerAndComponents(embed, [row]);
}

function buildModerationPanelMessage() {
  const embed = createBaseEmbed('HEXA_HUB MODÉRATION', 'HEXA_HUB • MODERATION')
    .setTitle('🛡️ PANEL MODÉRATION')
    .setDescription([
      '💜 GESTION STAFF HEXA_HUB',
      '',
      'UTILISE LES BOUTONS CI-DESSOUS',
      'POUR GÉRER LES MEMBRES,',
      'LES COMPTES ET LA BOUTIQUE.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '🔨 BAN / UNBAN',
      '👢 KICK',
      '🔇 MUTE / UNMUTE',
      '⚠️ AVERTIR',
      '🚫 BLOQUER BOUTIQUE',
      '✅ DÉBLOQUER BOUTIQUE',
      '🗑️ SUPPRIMER COMPTE'
    ].join('\n'));

  const rowOne = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('moderation:ban').setLabel('Ban').setEmoji('🔨').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('moderation:unban').setLabel('Unban').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('moderation:kick').setLabel('Kick').setEmoji('👢').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('moderation:warn').setLabel('Avertir').setEmoji('⚠️').setStyle(ButtonStyle.Secondary)
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('moderation:mute').setLabel('Mute').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('moderation:unmute').setLabel('Unmute').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('moderation:shop-block').setLabel('Bloquer boutique').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('moderation:shop-unblock').setLabel('Débloquer boutique').setEmoji('✅').setStyle(ButtonStyle.Success)
  );

  const rowThree = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('moderation:delete-account').setLabel('Supprimer compte').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
  );

  return withBannerAndComponents(embed, [rowOne, rowTwo, rowThree]);
}

module.exports = {
  buildAccountCreatedAdminMessage,
  buildAccountPrivateMessage,
  buildAccountsPanelMessage,
  buildAdminCategorySelectMessage,
  buildAdminProductSelectMessage,
  buildCatalogueAdminMessage,
  buildCatalogueCategoryMessage,
  buildCataloguePublicMessage,
  buildCartMessage,
  buildBecomeSellerMessage,
  buildDeliveryMessage,
  buildAddedToCartMessage,
  buildProductOrderMessage,
  buildOrderClaimTicketMessage,
  buildOrderLogMessage,
  buildRestockMessage,
  buildRevenueStatsMessage,
  buildRulesMessage,
  buildShopStatusMessage,
  buildSellerApplicationReviewMessage,
  buildSellerCatalogueCategoryMessage,
  buildSellerCataloguePublicMessage,
  buildSellerOwnCatalogueMessage,
  buildSellerPanelMessage,
  buildSellerProductSelectMessage,
  buildSellerSubmissionReviewMessage,
  buildSupportPanelMessage,
  buildSupportTicketMessage,
  buildModerationPanelMessage,
  buildUpdateMessage,
  buildVouchPanelMessage,
  buildVouchOrderSelectMessage,
  buildVouchPublicMessage,
  buildVouchVerifyMessage,
  buildWelcomeMessage
};
