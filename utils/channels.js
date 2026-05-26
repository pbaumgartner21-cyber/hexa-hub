const DISCORD_ID_REGEX = /^\d{17,22}$/;

function isDiscordId(value) {
  return typeof value === 'string' && DISCORD_ID_REGEX.test(value.trim());
}

function normalizeChannelName(name) {
  return name
    .replace(/^#/, '')
    .trim()
    .toLowerCase();
}

function fallbackMention(fallbackName) {
  return `#${normalizeChannelName(fallbackName || 'salon')}`;
}

function channelMention(channelId, fallbackName) {
  if (isDiscordId(channelId)) {
    return `<#${channelId.trim()}>`;
  }

  return fallbackMention(fallbackName);
}

function channelMentionByName(guild, channelId, fallbackName) {
  if (isDiscordId(channelId)) {
    return `<#${channelId.trim()}>`;
  }

  const expectedName = normalizeChannelName(fallbackName);
  const channel = guild?.channels?.cache?.find((guildChannel) =>
    normalizeChannelName(guildChannel.name) === expectedName
  );

  if (channel) {
    return `<#${channel.id}>`;
  }

  return fallbackMention(fallbackName);
}

async function fetchTextChannel(client, channelId) {
  if (!isDiscordId(channelId)) return null;

  const channel = await client.channels.fetch(channelId.trim()).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  return channel;
}

module.exports = {
  channelMention,
  channelMentionByName,
  fetchTextChannel,
  isDiscordId
};
