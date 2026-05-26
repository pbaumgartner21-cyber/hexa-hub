const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

if (!config.token) {
  throw new Error('DISCORD_TOKEN est vide dans le fichier .env');
}

if (!config.clientId) {
  throw new Error('CLIENT_ID est vide dans le fichier .env');
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

async function deployCommands() {
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  console.log(`[DEPLOY] Envoi de ${commands.length} commande(s)...`);
  await rest.put(route, { body: commands });
  console.log('[DEPLOY] Commandes Discord deployees.');
}

deployCommands().catch((error) => {
  console.error('[DEPLOY] Erreur pendant le deploy des commandes:', error);
  process.exitCode = 1;
});
