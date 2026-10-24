const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { encryptSessionJson, decryptSessionJson } = require('../src/crypto/sessionEncrypt');
const { assertRecordNotExpired } = require('../src/crypto/decrypt');

test('세션 암호화 복원 및 변조 거부', () => {
  const key = crypto.randomBytes(32).toString('base64');
  const original = [{ content: '테스트 민원' }];
  const payload = encryptSessionJson(original, key);
  assert.deepEqual(decryptSessionJson(payload, key), original);
  assert.throws(() => decryptSessionJson(payload, crypto.randomBytes(32).toString('base64')));
  const bytes = Buffer.from(payload.ciphertext, 'base64');
  bytes[0] ^= 1;
  assert.throws(() => decryptSessionJson({ ...payload, ciphertext: bytes.toString('base64') }, key));
});

test('만료 시각부터 기록 열람 거부', () => {
  const record = { expiresAt: '2030-01-01T00:00:00Z' };
  assert.doesNotThrow(() => assertRecordNotExpired(record, new Date('2029-12-31T23:59:59Z')));
  assert.throws(() => assertRecordNotExpired(record, new Date(record.expiresAt)), /expired/);
});

// 실제 환경 설정과 운영 파일을 사용하지 않도록 별도 프로세스에서 격리합니다.
function runIsolated(source, overrides = {}) {
  const env = { ...process.env };
  for (const name of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'COMPLAINT_CATEGORY_ID', 'LOG_CHANNEL_ID', 'ALERT_CHANNEL_ID', 'ADMIN_ROLE_ID', 'SUPER_ADMIN_ID']) env[name] = '123456789012345678';
  Object.assign(env, {
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), REDIS_URL: '',
    SESSION_TIMEOUT_HOURS: '24', COOLDOWN_MINUTES: '30', RECORD_RETENTION_DAYS: '14',
    WORK_HOURS_START: '9', WORK_HOURS_END: '18', MAX_ATTACHMENT_SIZE_MB: '10',
    ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS: 'true', ENABLE_WORK_HOURS_NOTICE: 'true'
  }, overrides);
  const result = spawnSync(process.execPath, ['-e', "require('dotenv').config = () => ({});\n" + source], {
    cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8'
  });
  if (result.error) throw result.error;
  return result;
}

test('잘못된 설정값을 시작 시 거부', () => {
  for (const overrides of [{ WORK_HOURS_START: '24' }, { RECORD_RETENTION_DAYS: '-1' }, { ENABLE_WORK_HOURS_NOTICE: 'treu' }]) {
    const result = runIsolated("require('./src/config')", overrides);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Invalid/);
  }
});

test('비동기 명령 오류도 사용자에게 안내', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const admin = require('./src/handlers/adminHandler');
    admin.isAdmin = () => true;
    admin.stats = async () => { throw new Error('simulated'); };
    let notified = false;
    const interaction = {
      isChatInputCommand: () => true, commandName: '통계', guildId: 'test',
      reply: async (payload) => { notified = payload.content.includes('오류'); }
    };
    (async () => {
      await assert.rejects(require('./src/events/interactionCreate')({}, interaction), /simulated/);
      assert.equal(notified, true);
    })().catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('손상된 세션을 빈 상태로 처리하지 않음', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const fs = require('node:fs/promises');
    fs.readFile = async () => '{invalid-json';
    assert.rejects(require('./src/session/persistence').loadSessions(), SyntaxError)
      .catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('잘린 암호화 기록은 명확한 오류로 거부', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    require('node:fs/promises').readFile = async () => Buffer.from([1]);
    assert.rejects(require('./src/crypto/decrypt').decryptRecord('unused', 'unused'), /truncated payload/)
      .catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('다른 사용자의 민원 종료 버튼은 거부', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const store = require('./src/session/sessionStore');
    store.set({ anonymousId: 'TEST', complainantId: 'owner' });
    let reply;
    const interaction = {
      channel: { isDMBased: () => true }, user: { id: 'stranger' },
      customId: 'user:confirm:TEST', reply: async (payload) => { reply = payload; }
    };
    (async () => {
      await require('./src/handlers/userFlow').handleUserButton({}, interaction);
      assert.match(reply.content, /이용할 수 없는/);
      assert.ok(store.getByAnonymousId('TEST'));
    })().catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('DM 종료 명령은 즉시 종료하지 않고 확인 버튼을 제공', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const store = require('./src/session/sessionStore');
    store.set({ anonymousId: 'TEST', complainantId: 'owner' });
    let reply;
    const message = {
      author: { id: 'owner', bot: false }, channel: { isDMBased: () => true },
      content: '!종료', reply: async (payload) => { reply = payload; }
    };
    (async () => {
      await require('./src/events/messageCreate')({}, message);
      assert.match(reply.content, /종료할까요/);
      assert.equal(reply.components[0].components.length, 2);
      assert.ok(store.getByAnonymousId('TEST'));
    })().catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('Redis 장애 중 파일에 저장된 최신 스냅샷을 Redis보다 우선', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const { encryptSessionJson } = require('./src/crypto/sessionEncrypt');
    const key = process.env.SESSION_ENCRYPTION_KEY;
    const redis = require('./src/storage/redisClient');
    redis.isRedisEnabled = () => true;
    redis.getJson = async () => ({ ...encryptSessionJson([{ anonymousId: 'OLD' }], key), savedAt: 1 });
    require('node:fs/promises').readFile = async () => JSON.stringify({ ...encryptSessionJson([{ anonymousId: 'NEW' }], key), savedAt: 2 });
    require('./src/session/persistence').loadSessions()
      .then((sessions) => assert.equal(sessions[0].anonymousId, 'NEW'))
      .catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('종료 처리 중 받은 DM은 저장된 것처럼 표시하지 않음', () => {
  const result = runIsolated(`
    const assert = require('node:assert/strict');
    const store = require('./src/session/sessionStore');
    store.set({ anonymousId: 'TEST', complainantId: 'owner', messages: [], attachments: [] });
    // relayHandler가 불러오기 전에 바꿔야 구조 분해한 함수에 반영됩니다.
    require('./src/handlers/closeHandler').isClosing = () => true;
    let reply;
    const message = {
      author: { id: 'owner', bot: false }, channel: { isDMBased: () => true },
      content: '추가 내용', attachments: new Map(), reply: async (payload) => { reply = payload; },
      react: async () => { throw new Error('should not react'); }
    };
    (async () => {
      await require('./src/events/messageCreate')({}, message);
      assert.match(reply, /전달되지 않았습니다/);
      assert.equal(store.getByAnonymousId('TEST').messages.length, 0);
    })().catch(() => { process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});
