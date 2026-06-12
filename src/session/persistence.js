const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');
const logger = require('../utils/logger');
const { encryptSessionJson, decryptSessionJson } = require('../crypto/sessionEncrypt');
const redis = require('../storage/redisClient');

const filePath = path.join('sessions', 'sessions.enc.json');
const redisKey = 'complaint-bot:sessions';

async function loadSessions() {
  if (redis.isRedisEnabled()) {
    try {
      const payload = await redis.getJson(redisKey);
      return payload ? decryptSessionJson(payload, config.sessionEncryptionKey) : [];
    } catch (error) {
      await logger.warn('Could not load encrypted sessions from Redis; falling back to file', error);
    }
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return decryptSessionJson(JSON.parse(raw), config.sessionEncryptionKey);
  } catch (error) {
    if (error.code !== 'ENOENT') await logger.warn('Could not load encrypted sessions', error);
    return [];
  }
}

async function saveSessions(sessions) {
  const payload = encryptSessionJson(sessions, config.sessionEncryptionKey);
  if (redis.isRedisEnabled()) {
    try {
      await redis.setJson(redisKey, payload);
      return;
    } catch (error) {
      await logger.warn('Could not save encrypted sessions to Redis; falling back to file', error);
    }
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

module.exports = { loadSessions, saveSessions };
