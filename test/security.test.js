const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Collection, PermissionsBitField, PermissionFlagsBits: P, ChannelType, OverwriteType } = require('discord.js');

// 운영 .env나 삭제된 키를 읽지 않고, 이 테스트 프로세스에서만 가짜 설정을 사용합니다.
const config = {
  guildId: 'guild', adminRoleId: 'admin', superAdminId: 'super', logChannelId: 'archive',
  alertChannelId: 'alert', maxAttachmentSizeMb: 10, recordRetentionDays: 14,
  cooldownMinutes: 30, enablePlaintextArchive: false, redisUrl: '',
  sessionEncryptionKey: Buffer.alloc(32, 7).toString('base64')
};
const configPath = require.resolve('../src/config');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: config };

const store = require('../src/session/sessionStore');
const ids = require('../src/utils/anonymousId');
const { appendClosedStat, loadClosedStats, cleanupExpiredArchives } = require('../src/records/statistics');
const { assertArchiveChannel } = require('../src/utils/archivePermissions');

async function isolatedDirectory(operation) {
  const previous = process.cwd();
  const temporaryRoot = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(temporaryRoot, 'complaint-security-'));
  try {
    process.chdir(directory);
    return await operation(directory);
  } finally {
    process.chdir(previous);
    // 테스트가 만든 임시 디렉터리만 삭제합니다.
    if (path.dirname(directory) !== temporaryRoot || !path.basename(directory).startsWith('complaint-security-')) {
      throw new Error('Unexpected test cleanup path');
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function sample(id) {
  return {
    anonymousId: id, complainantId: `owner-${id}`, channelId: `channel-${id}`,
    category: '기타', priority: 'normal', status: 'received', title: '비공개 제목',
    startedAt: '2026-01-01T00:00:00Z', closedAt: '2026-01-02T00:00:00Z',
    messages: [{ role: 'complainant', content: '비공개 본문', timestamp: '2026-01-01T00:00:00Z' }],
    attachments: [], internalMemos: [], internalTags: [],
    archiveChannelId: 'archive', archiveMessageId: `message-${id}`, archiveDeleteAt: '2026-01-16T00:00:00Z'
  };
}

test('ID 충돌과 생성 중 예약을 검사하고 다른 민원의 덮어쓰기를 거부', (t) => {
  store.replaceAll([]);
  const occupied = '01'.repeat(16);
  store.set({ ...sample(occupied) });
  const candidates = [1, 2, 2, 3];
  t.mock.method(crypto, 'randomBytes', (size) => Buffer.alloc(size, candidates.shift()));
  const first = ids.generateAnonymousId();
  const second = ids.generateAnonymousId();
  assert.equal(first, '02'.repeat(16));
  assert.equal(second, '03'.repeat(16));
  assert.throws(() => store.set({ ...sample(occupied), complainantId: 'another' }), /another complaint/);
  assert.equal(store.getByAnonymousId(occupied).complainantId, `owner-${occupied}`);
  assert.throws(() => store.replaceAll([sample('duplicate'), sample('duplicate')]), /Duplicate/);
  assert.ok(store.getByAnonymousId(occupied));
  ids.releaseAnonymousId(first);
  ids.releaseAnonymousId(second);
  store.replaceAll([]);
});

test('동시 종료와 자동 삭제가 겹쳐도 모든 만료 기록을 보존', async () => {
  await isolatedDirectory(async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => appendClosedStat(sample(String(i)))));
    assert.equal((await loadClosedStats()).length, 20);
    let deleted = 0;
    const client = { channels: { fetch: async () => ({
      isTextBased: () => true,
      messages: { fetch: async () => ({ delete: async () => { deleted += 1; } }) }
    }) } };
    await Promise.all([
      cleanupExpiredArchives(client, new Date('2026-02-01T00:00:00Z')),
      appendClosedStat(sample('new'))
    ]);
    const stats = await loadClosedStats();
    assert.equal(stats.length, 21);
    assert.equal(deleted, 20);
    assert.equal(stats.filter((item) => item.archiveDeletedAt).length, 20);
    assert.ok(stats.find((item) => item.anonymousId === 'new'));
  });
});

test('저장 실패 후 큐가 복구되고 원본 파일을 보존', async (t) => {
  await isolatedDirectory(async () => {
    await appendClosedStat(sample('original'));
    const rename = t.mock.method(fs, 'rename', async () => { throw new Error('simulated disk failure'); });
    await assert.rejects(appendClosedStat(sample('failed')), /simulated disk failure/);
    assert.deepEqual((await loadClosedStats()).map((item) => item.anonymousId), ['original']);
    assert.deepEqual(await fs.readdir('records'), ['stats-index.json']);
    rename.mock.restore();
    await appendClosedStat(sample('recovered'));
    assert.equal((await loadClosedStats()).length, 2);
  });
});

test('동시 세션 저장 후 최신 암호화 스냅샷을 읽음', async () => {
  await isolatedDirectory(async () => {
    const { saveSessions, loadSessions } = require('../src/session/persistence');
    await Promise.all(Array.from({ length: 10 }, (_, i) => saveSessions([sample(String(i))])));
    assert.equal((await loadSessions())[0].anonymousId, '9');
    const payload = await fs.readFile('sessions/sessions.enc.json', 'utf8');
    assert.ok(!payload.includes('비공개 본문'));
  });
});

function overwrite(id, type, allow = [], deny = []) {
  return { id, type, allow: new PermissionsBitField(allow), deny: new PermissionsBitField(deny) };
}

function archiveChannel() {
  const everyone = { permissions: new PermissionsBitField() };
  return {
    guildId: 'guild', type: ChannelType.GuildText,
    guild: {
      roles: { everyone, cache: new Collection(), fetch: async () => {} },
      members: { fetchMe: async () => {} }
    },
    permissionOverwrites: { cache: new Collection([
      ['guild', overwrite('guild', OverwriteType.Role, [], [P.ViewChannel])],
      ['admin', overwrite('admin', OverwriteType.Role, [P.ViewChannel])],
      ['bot', overwrite('bot', OverwriteType.Member, [P.ViewChannel])]
    ]) },
    permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory])
  };
}

test('기록 채널의 공개 권한·외부 역할·개인 허용·서버·유형·봇 권한 검사', () => {
  assert.doesNotThrow(() => assertArchiveChannel(archiveChannel(), config, 'bot'));
  const mutations = [
    (c) => c.permissionOverwrites.cache.delete('guild'),
    (c) => c.permissionOverwrites.cache.set('outsider', overwrite('outsider', OverwriteType.Role, [P.ViewChannel])),
    (c) => c.permissionOverwrites.cache.set('outsider', overwrite('outsider', OverwriteType.Member, [P.ViewChannel])),
    (c) => { c.guildId = 'other'; },
    (c) => { c.type = ChannelType.GuildAnnouncement; },
    (c) => { c.permissionsFor = () => new PermissionsBitField(); },
    (c) => { c.guild.roles.everyone.permissions.add(P.Administrator); }
  ];
  for (const mutate of mutations) {
    const channel = archiveChannel();
    mutate(channel);
    assert.throws(() => assertArchiveChannel(channel, config, 'bot'), /Unsafe archive channel/);
  }
});

test('종료 시 기본 암호화 파일만 전송하고 평문은 명시적 설정에서만 생성', async (t) => {
  // 암호화의 무결성은 regression.test.js에서 검사하며 여기서는 업로드 경계를 검증합니다.
  t.mock.method(require('../src/crypto/encrypt'), 'encryptRecord', async () => Buffer.from('encrypted fixture'));
  const { closeComplaint } = require('../src/handlers/closeHandler');
  await isolatedDirectory(async () => {
    const sent = [];
    let removed = 0;
    const archive = archiveChannel();
    archive.send = async (payload) => { sent.push(payload); return { id: `saved-${sent.length}` }; };
    const client = {
      user: { id: 'bot' }, users: { fetch: async () => ({ send: async () => {} }) },
      channels: { fetch: async (id) => id === 'archive' ? archive : {
        isTextBased: () => false, deletable: true, delete: async () => { removed += 1; }
      } }
    };
    try {
      for (const enabled of [false, true]) {
        config.enablePlaintextArchive = enabled;
        const session = sample(String(enabled));
        store.set(session);
        await closeComplaint(client, session, 'admin_closed', { id: 'admin-user' }, '비공개 종료 사유');
      }
      assert.equal(sent[0].files.length, 1);
      assert.ok(sent[0].files[0].name.endsWith('.enc'));
      assert.ok(!JSON.stringify(sent[0].embeds).includes('비공개 종료 사유'));
      assert.equal(sent[1].files.length, 2);
      assert.ok(sent[1].files[1].name.endsWith('-anonymous.txt'));
      assert.equal(removed, 2);
      assert.equal((await loadClosedStats()).length, 2);

      const unsafe = sample('unsafe');
      store.set(unsafe);
      archive.permissionOverwrites.cache.delete('guild');
      await assert.rejects(closeComplaint(client, unsafe), /Unsafe archive channel/);
      assert.equal(sent.length, 2);
      assert.equal(removed, 2);
      assert.equal(store.getByAnonymousId('unsafe').status, 'received');
    } finally {
      config.enablePlaintextArchive = false;
      store.replaceAll([]);
    }
  });
});
