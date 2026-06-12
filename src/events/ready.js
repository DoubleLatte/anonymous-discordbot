const cron = require('node-cron');
const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const sessionStore = require('../session/sessionStore');
const { isTimedOut } = require('../utils/schedule');
const { closeComplaint } = require('../handlers/closeHandler');

module.exports = async function ready(client) {
  client.user.setPresence({
    activities: [{ name: 'DM으로 민원 받는중', type: ActivityType.Custom }],
    status: 'online'
  });
  await logger.info(`Logged in as ${client.user.tag}. Restored ${sessionStore.all().length} active sessions.`);
  cron.schedule('*/10 * * * *', async () => {
    for (const session of sessionStore.all()) {
      if (isTimedOut(session)) {
        await logger.info('Auto closing timed-out complaint', { anonymousId: session.anonymousId });
        await closeComplaint(client, session, 'timeout').catch((error) => logger.error('Auto close failed', error));
      }
    }
  });
};
