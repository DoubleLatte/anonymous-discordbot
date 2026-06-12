const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const { loadSessions } = require('./session/persistence');
const sessionStore = require('./session/sessionStore');
const cooldown = require('./utils/cooldown');
const { loadAbuseState } = require('./storage/abusePersistence');
const ready = require('./events/ready');
const interactionCreate = require('./events/interactionCreate');
const messageCreate = require('./events/messageCreate');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

process.on('uncaughtException', (error) => logger.error('uncaughtException', error));
process.on('unhandledRejection', (error) => logger.error('unhandledRejection', error));

client.once('ready', async () => ready(client));
client.on('interactionCreate', async (interaction) => interactionCreate(client, interaction));
client.on('messageCreate', async (message) => messageCreate(client, message));

async function start() {
  const sessions = await loadSessions();
  const abuseState = await loadAbuseState();
  sessionStore.replaceAll(sessions);
  cooldown.replaceState(abuseState);
  await client.login(config.token);
}

if (require.main === module) {
  start().catch((error) => logger.error('startup failed', error));
}

module.exports = { client, start };
