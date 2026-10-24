const cron = require('node-cron');
const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const sessionStore = require('../session/sessionStore');
const { isTimedOut } = require('../utils/schedule');
const { closeComplaint } = require('../handlers/closeHandler');
const { cleanupExpiredArchives } = require('../records/statistics');

module.exports = async function ready(client) {
  client.user.setPresence({
    activities: [{ name: 'DM으로 /민원 명령어 받는중', type: ActivityType.Custom }],
    status: 'online'
  });
  await logger.info(`Logged in as ${client.user.tag}. Restored ${sessionStore.all().length} active sessions.`);
  await runArchiveCleanup(client);
  let running = false;
  cron.schedule('*/10 * * * *', async () => {
    // 종료·정리가 10분을 넘겨도 다음 실행과 겹치지 않게 합니다.
    if (running) return;
    running = true;
    try {
      for (const { anonymousId } of sessionStore.all()) {
        // 앞선 종료를 기다리는 동안 새 메시지가 오면 updatedAt이 바뀌므로 최신 세션으로 다시 확인합니다.
        const session = sessionStore.getByAnonymousId(anonymousId);
        if (!session || !isTimedOut(session)) continue;
        await logger.info('Auto closing timed-out complaint', { anonymousId });
        await closeComplaint(client, session, 'timeout').catch((error) => logger.error('Auto close failed', error));
      }
      await runArchiveCleanup(client);
    } finally {
      running = false;
    }
  });
};

async function runArchiveCleanup(client) {
  try {
    const result = await cleanupExpiredArchives(client);
    if (result.deleted || result.failed) await logger.info('Archive retention cleanup completed', result);
  } catch (error) {
    await logger.error('Archive retention cleanup failed', error);
  }
}
