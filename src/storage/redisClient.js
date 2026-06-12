const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

let client;

function isRedisEnabled() {
  return Boolean(config.redisUrl);
}

function getRedisClient() {
  if (!isRedisEnabled()) return null;
  if (!client) {
    client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false
    });
    client.on('error', (error) => logger.warn('Redis error', error));
  }
  return client;
}

async function getJson(key) {
  const redis = getRedisClient();
  if (!redis) return null;
  if (redis.status === 'wait') await redis.connect();
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function setJson(key, value) {
  const redis = getRedisClient();
  if (!redis) return false;
  if (redis.status === 'wait') await redis.connect();
  await redis.set(key, JSON.stringify(value));
  return true;
}

async function pingRedis() {
  const redis = getRedisClient();
  if (!redis) return null;
  if (redis.status === 'wait') await redis.connect();
  return redis.ping();
}

async function quitRedis() {
  if (!client) return;
  if (client.status !== 'end') await client.quit().catch(() => client.disconnect());
  client = null;
}

module.exports = { isRedisEnabled, getJson, setJson, pingRedis, quitRedis };
