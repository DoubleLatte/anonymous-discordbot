const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');
const logger = require('../utils/logger');
const { encryptSessionJson, decryptSessionJson } = require('../crypto/sessionEncrypt');
const redis = require('./redisClient');

const filePath = path.join('sessions', 'abuse-state.enc.json');
const redisKey = 'complaint-bot:abuse-state';

async function loadAbuseState() {
  if (redis.isRedisEnabled()) {
    try {
      const payload = await redis.getJson(redisKey);
      return payload ? decryptSessionJson(payload, config.sessionEncryptionKey) : { blockedUsers: [], cooldownUntil: [] };
    } catch (error) {
      await logger.warn('Could not load abuse state from Redis; falling back to file', error);
    }
  }

  try {
    return decryptSessionJson(JSON.parse(await fs.readFile(filePath, 'utf8')), config.sessionEncryptionKey);
  } catch (error) {
    if (error.code === 'ENOENT') return { blockedUsers: [], cooldownUntil: [] };
    throw error;
  }
}

async function saveAbuseState(state) {
  const payload = encryptSessionJson(state, config.sessionEncryptionKey);
  if (redis.isRedisEnabled()) {
    try {
      await redis.setJson(redisKey, payload);
      return;
    } catch (error) {
      await logger.warn('Could not save abuse state to Redis; falling back to file', error);
    }
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

module.exports = { loadAbuseState, saveAbuseState };
