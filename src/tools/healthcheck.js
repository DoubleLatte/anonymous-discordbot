require('dotenv').config();
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const config = require('../config');
const { encryptSessionJson, decryptSessionJson } = require('../crypto/sessionEncrypt');
const { pingRedis, isRedisEnabled, quitRedis } = require('../storage/redisClient');

async function main() {
  const checks = [];
  checks.push(checkSnowflake('CLIENT_ID', config.clientId));
  checks.push(checkSnowflake('GUILD_ID', config.guildId));
  checks.push(checkSnowflake('COMPLAINT_CATEGORY_ID', config.complaintCategoryId));
  checks.push(checkSnowflake('LOG_CHANNEL_ID', config.logChannelId));
  checks.push(checkSnowflake('ALERT_CHANNEL_ID', config.alertChannelId));
  checks.push(checkSnowflake('ADMIN_ROLE_ID', config.adminRoleId));
  checks.push(checkSnowflake('SUPER_ADMIN_ID', config.superAdminId));
  checks.push(checkSessionKey());
  checks.push(await checkPublicKey());
  checks.push(await checkRedis());

  for (const check of checks) {
    const mark = check.ok ? 'OK ' : 'ERR';
    console.log(`[${mark}] ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  const failed = checks.filter((check) => !check.ok);
  await quitRedis();
  if (failed.length) process.exit(1);
}

function checkSnowflake(name, value) {
  const ok = /^\d{17,20}$/.test(value);
  return { name, ok, detail: ok ? '' : 'Discord ID 형식이 아닙니다' };
}

function checkSessionKey() {
  try {
    const sample = [{ anonymousId: 'CHECK' }];
    const payload = encryptSessionJson(sample, config.sessionEncryptionKey);
    const restored = decryptSessionJson(payload, config.sessionEncryptionKey);
    return { name: 'SESSION_ENCRYPTION_KEY', ok: restored[0].anonymousId === 'CHECK' };
  } catch (error) {
    return { name: 'SESSION_ENCRYPTION_KEY', ok: false, detail: error.message };
  }
}

async function checkPublicKey() {
  try {
    const pem = await fs.readFile(config.publicKeyPath, 'utf8');
    const key = crypto.createPublicKey(pem);
    const details = key.asymmetricKeyDetails || {};
    const ok = key.asymmetricKeyType === 'rsa' && details.modulusLength === 4096;
    return {
      name: 'PUBLIC_KEY_PATH',
      ok,
      detail: ok ? config.publicKeyPath : 'RSA-4096 공개키가 아닙니다'
    };
  } catch (error) {
    return { name: 'PUBLIC_KEY_PATH', ok: false, detail: error.message };
  }
}

async function checkRedis() {
  if (!isRedisEnabled()) return { name: 'REDIS_URL', ok: true, detail: '미사용, 암호화 파일 저장 사용' };
  try {
    const result = await pingRedis();
    return { name: 'REDIS_URL', ok: result === 'PONG', detail: result };
  } catch (error) {
    return { name: 'REDIS_URL', ok: false, detail: error.message };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
