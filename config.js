require('dotenv').config();

function parseColor(value) {
  const fallback = 0x7b2cbf;
  if (!value) return fallback;

  const normalized = value.trim().replace('#', '');
  const parsed = Number.parseInt(normalized, 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  shopName: process.env.SHOP_NAME || 'HEXA_HUB',
  embedColor: parseColor(process.env.EMBED_COLOR),
  bannerPath: process.env.BANNER_PATH || 'templates/banner.png',
  staffRoleId: process.env.STAFF_ROLE_ID || '1504979937268863006',
  sellerRoleId: process.env.SELLER_ROLE_ID || '1509143994242830346',
  sellerPremiumRoleId: process.env.SELLER_PREMIUM_ROLE_ID || '1509144442018201730',
  api: {
    enabled: process.env.API_ENABLED !== 'false',
    port: Number(process.env.PORT || process.env.API_PORT || 3000),
    siteOrigin: process.env.SITE_ORIGIN || '*',
    jwtSecret: process.env.API_SECRET || process.env.DISCORD_TOKEN || 'dev-secret-change-me'
  },
  logs: {
    messages: process.env.LOG_MESSAGES_CHANNEL_ID || '1508463776863879168',
    voice: process.env.LOG_VOICE_CHANNEL_ID || '1508463865598447697',
    tickets: process.env.LOG_TICKETS_CHANNEL_ID || '1508463931134443690',
    moderation: process.env.LOG_MODERATION_CHANNEL_ID || '1508464017268539392',
    shop: process.env.LOG_SHOP_CHANNEL_ID || '1508464569092149298'
  },
  dataCategoryId: process.env.DATA_CATEGORY_ID || '1508464949016400005',
  dataChannels: {
    accounts: process.env.DATA_ACCOUNTS_CHANNEL_ID || '1508465065387626627',
    catalogue: process.env.DATA_CATALOGUE_CHANNEL_ID || '1508465069716013106',
    sellers: process.env.DATA_SELLERS_CHANNEL_ID || process.env.DATA_CATALOGUE_CHANNEL_ID || '1508465069716013106',
    vouches: process.env.DATA_VOUCHES_CHANNEL_ID || '1508465156785438780',
    orders: process.env.DATA_ORDERS_CHANNEL_ID || '1508465204680458471'
  },
  channels: {
    rules: process.env.RULES_CHANNEL_ID || '1504979960501243976',
    welcome: process.env.WELCOME_CHANNEL_ID || '1504979963579994205',
    updates: process.env.UPDATES_CHANNEL_ID || '1504979966994022431',
    accounts: process.env.ACCOUNTS_CHANNEL_ID || '1507381884945174760',
    accountLogs: process.env.ACCOUNT_LOGS_CHANNEL_ID || '1508122797161840761',
    shopStatus: process.env.SHOP_STATUS_CHANNEL_ID || '1506702782839918722',
    catalogue: process.env.CATALOGUE_CHANNEL_ID || '1504979977798553782',
    catalogueAdmin: process.env.CATALOGUE_ADMIN_CHANNEL_ID || '1508127052040241282',
    sellerCatalogue: process.env.SELLER_CATALOGUE_CHANNEL_ID || '',
    devenirSeller: process.env.DEVENIR_SELLER_CHANNEL_ID || '',
    sellerRequests: process.env.SELLER_REQUESTS_CHANNEL_ID || process.env.CATALOGUE_ADMIN_CHANNEL_ID || '1508127052040241282',
    commandeLogs: process.env.COMMANDE_CHANNEL_ID || '1508486820164538558',
    resultat: process.env.RESULTAT_CHANNEL_ID || '1508486879324934165',
    restock: process.env.RESTOCK_CHANNEL_ID || '1507378627338305558',
    vouchPanel: process.env.VOUCH_PANEL_CHANNEL_ID || '1507072193006403594',
    vouchVerify: process.env.VOUCH_VERIFY_CHANNEL_ID || '1507360423182073968',
    vouchClient: process.env.VOUCH_CLIENT_CHANNEL_ID || '1507356625344921681',
    supportCategory: process.env.SUPPORT_CATEGORY_ID || '1507363577206542507',
    accountPrivateCategory: process.env.ACCOUNT_PRIVATE_CATEGORY_ID || '1508471319598202971',
    supportPanel: process.env.SUPPORT_PANEL_CHANNEL_ID || '',
    modLogs: process.env.LOG_MODERATION_CHANNEL_ID || process.env.MOD_LOG_CHANNEL_ID || '1508464017268539392',
    commander: process.env.COMMANDER_CHANNEL_ID || '',
    general: process.env.GENERAL_CHANNEL_ID || ''
  }
};
