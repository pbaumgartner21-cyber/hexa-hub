const OCTOPUS_REACTION = '🐙';

async function reactWithOctopus(message) {
  if (!message?.react) return;

  await message.react(OCTOPUS_REACTION).catch((error) => {
    console.warn('[REACTION] Impossible d ajouter la reaction pieuvre:', error.message);
  });
}

async function sendBotMessage(channel, options) {
  const message = await channel.send(options);
  await reactWithOctopus(message);
  return message;
}

module.exports = {
  OCTOPUS_REACTION,
  reactWithOctopus,
  sendBotMessage
};
