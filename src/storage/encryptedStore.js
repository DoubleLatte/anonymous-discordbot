const fs = require('node:fs/promises');
const config = require('../config');
const logger = require('../utils/logger');
const { encryptSessionJson, decryptSessionJson } = require('../crypto/sessionEncrypt');
const redis = require('./redisClient');
const { createSerialQueue, writeJsonAtomic } = require('./fileIO');

// Redis 장애 중에는 파일에 저장되므로, 불러올 때 두 저장소 중 더 최근 스냅샷을 사용합니다.
function createEncryptedStore({ label, redisKey, filePath, empty }) {
  const enqueueSave = createSerialQueue();

  async function load() {
    const candidates = [];
    if (redis.isRedisEnabled()) {
      try {
        const payload = await redis.getJson(redisKey);
        if (payload) candidates.push(payload);
      } catch (error) {
        await logger.warn(`Could not load ${label} from Redis; falling back to file`, error);
      }
    }

    try {
      candidates.push(JSON.parse(await fs.readFile(filePath, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // 복호화·파싱 실패를 빈 상태로 처리하면 다음 저장 때 원본을 잃을 수 있습니다.
        if (!candidates.length) throw error;
        await logger.warn(`Could not read ${label} file; using Redis snapshot`, error);
      }
    }

    if (!candidates.length) return empty();
    // savedAt이 없는 이전 형식끼리는 기존처럼 Redis를 우선합니다.
    const latest = candidates.reduce((best, item) => ((item.savedAt || 0) > (best.savedAt || 0) ? item : best));
    return decryptSessionJson(latest, config.sessionEncryptionKey);
  }

  async function save(value) {
    const payload = { ...encryptSessionJson(value, config.sessionEncryptionKey), savedAt: Date.now() };
    return enqueueSave(() => savePayload(payload));
  }

  async function savePayload(payload) {
    if (redis.isRedisEnabled()) {
      try {
        await redis.setJson(redisKey, payload);
        return;
      } catch (error) {
        await logger.warn(`Could not save ${label} to Redis; falling back to file`, error);
      }
    }

    await writeJsonAtomic(filePath, payload);
  }

  return { load, save };
}

module.exports = { createEncryptedStore };
