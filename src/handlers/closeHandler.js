const { AttachmentBuilder } = require('discord.js');
const config = require('../config');
const sessionStore = require('../session/sessionStore');
const { saveSessions } = require('../session/persistence');
const { encryptRecord } = require('../crypto/encrypt');
const { setCooldown, snapshotState } = require('../utils/cooldown');
const { saveAbuseState } = require('../storage/abusePersistence');
const { appendClosedStat } = require('../records/statistics');
const { deleteComplaintChannel } = require('./channelHandler');
const { archiveEmbed, completionEmbed } = require('../utils/embedBuilder');
const { getArchiveChannel } = require('../utils/archivePermissions');
const logger = require('../utils/logger');

const closingSessions = new Set();

async function closeComplaint(client, session, reason = 'completed', closedByUser = null, closeNote = '') {
  // DM 버튼·관리자 버튼·자동 종료가 겹쳐도 기록을 중복 전송하지 않습니다.
  if (closingSessions.has(session.anonymousId)) {
    const error = new Error('Complaint closure already in progress');
    error.userMessage = '이미 종료 처리 중입니다. 완료 안내가 올 때까지 잠시 기다려 주세요.';
    throw error;
  }
  if (!sessionStore.getByAnonymousId(session.anonymousId)) {
    const error = new Error('Complaint already closed');
    error.userMessage = '이미 종료된 민원입니다.';
    throw error;
  }
  closingSessions.add(session.anonymousId);
  try {
    return await performClose(client, session, reason, closedByUser, closeNote);
  } finally {
    closingSessions.delete(session.anonymousId);
  }
}

async function performClose(client, session, reason, closedByUser, closeNote) {
  const previousState = {
    status: session.status,
    closedAt: session.closedAt,
    closeReason: session.closeReason,
    closeNote: session.closeNote,
    closedBy: session.closedBy,
    archiveChannelId: session.archiveChannelId,
    archiveMessageId: session.archiveMessageId,
    archiveDeleteAt: session.archiveDeleteAt
  };
  const closedAt = new Date().toISOString();
  session.status = 'completed';
  session.closedAt = closedAt;
  session.closeReason = reason;
  session.closeNote = String(closeNote || '').trim() || defaultCloseNote(reason);
  session.closedBy = buildClosedBy(reason, closedByUser);
  session.archiveDeleteAt = new Date(
    new Date(session.closedAt).getTime() + config.recordRetentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let archiveMessage;
  try {
    const baseName = `complaint-${session.anonymousId}`;
    const encryptedRecord = await encryptRecord(buildEncryptedRecord(session), config.publicKeyPath);
    const archiveFiles = [
      { name: `${baseName}.enc`, data: encryptedRecord }
    ];
    if (config.enablePlaintextArchive) {
      archiveFiles.push({ name: `${baseName}-anonymous.txt`, data: Buffer.from(buildAnonymousTranscript(session), 'utf8') });
    }
    assertArchiveAttachmentSizes(archiveFiles);

    const logChannel = await getArchiveChannel(client, config);

    archiveMessage = await logChannel.send({
      embeds: [archiveEmbed(session)],
      allowedMentions: { parse: [] },
      files: archiveFiles.map((file) => new AttachmentBuilder(file.data, { name: file.name }))
    }).catch((error) => {
      if (isAttachmentTooLargeError(error)) throw archiveSizeError(archiveFiles, 'Discord가 첨부파일을 거부했습니다.');
      throw error;
    });
  } catch (error) {
    Object.assign(session, previousState);
    if (error.userMessage) await reportArchiveFailure(client, session, error.userMessage);
    throw error;
  }

  session.archiveChannelId = config.logChannelId;
  session.archiveMessageId = archiveMessage.id;

  // 기록이 전송된 뒤에는 세션을 먼저 제거해야 이후 단계가 실패해도 재시도로 기록이 중복 전송되지 않습니다.
  sessionStore.remove(session.anonymousId);
  setCooldown(session.complainantId, config.cooldownMinutes);

  const user = await client.users.fetch(session.complainantId).catch(() => null);
  if (user) {
    await user.send({ embeds: [completionEmbed(session)] }).catch(() => null);
  }

  await appendClosedStat(session).catch((error) => logger.error('Closed stat append failed; archive message must be deleted manually after retention', {
    anonymousId: session.anonymousId,
    archiveMessageId: session.archiveMessageId,
    archiveDeleteAt: session.archiveDeleteAt,
    error: error.message
  }));
  await saveAbuseState(snapshotState());
  await saveSessions(sessionStore.all());
  await deleteComplaintChannel(client, session.channelId);
}

function isClosing(anonymousId) {
  return closingSessions.has(anonymousId);
}

function buildEncryptedRecord(session) {
  return {
    version: '1.0',
    complainant: {
      discordId: session.complainantId,
      tag: session.complainantTag,
      username: session.complainantUsername
    },
    anonymousId: session.anonymousId,
    title: session.title,
    category: session.category,
    priority: session.priority,
    status: 'completed',
    internalMemos: session.internalMemos,
    internalTags: session.internalTags,
    startedAt: session.startedAt,
    closedAt: session.closedAt,
    retentionDays: config.recordRetentionDays,
    expiresAt: new Date(new Date(session.closedAt).getTime() + config.recordRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
    messages: session.messages,
    attachments: session.attachments,
    closeReason: session.closeReason,
    closeNote: session.closeNote,
    closedBy: session.closedBy
  };
}

function defaultCloseNote(reason) {
  if (reason === 'complainant_requested') return '민원인이 종료를 요청했습니다.';
  if (reason === 'timeout') return '응답 없이 보관 시간이 지나 자동 종료되었습니다.';
  return '처리가 완료되었습니다.';
}

function assertArchiveAttachmentSizes(files) {
  const maxBytes = Math.max(1, config.maxAttachmentSizeMb) * 1024 * 1024;
  if (files.some((file) => file.data.length > maxBytes)) {
    throw archiveSizeError(files, `설정된 첨부 제한 ${config.maxAttachmentSizeMb}MB를 초과했습니다.`);
  }
}

function archiveSizeError(files, reason) {
  const sizes = files.map((file) => `${file.name}: ${formatBytes(file.data.length)}`).join(', ');
  const error = new Error(`Archive attachment too large: ${sizes}`);
  error.userMessage = `${reason}\n민원 채널과 세션은 유지되었습니다. (${sizes})`;
  return error;
}

function isAttachmentTooLargeError(error) {
  return [40005, 50045].includes(error?.code)
    || error?.status === 413
    || [40005, 50045].includes(error?.rawError?.code);
}

async function reportArchiveFailure(client, session, message) {
  const alertChannel = await client.channels.fetch(config.alertChannelId).catch(() => null);
  if (alertChannel?.isTextBased()) {
    await alertChannel.send({
      content: `<@&${config.adminRoleId}> 민원 \`${session.anonymousId}\` 기록 전송 실패\n${message}`,
      allowedMentions: { roles: [config.adminRoleId] }
    }).catch(() => null);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function buildClosedBy(reason, user) {
  if (reason === 'admin_closed' && user) {
    return {
      type: 'admin',
      discordId: user.id,
      tag: user.tag || user.username || '알 수 없음'
    };
  }
  if (reason === 'complainant_requested') return { type: 'complainant' };
  if (reason === 'timeout') return { type: 'system' };
  return { type: 'unknown' };
}

function buildAnonymousTranscript(session) {
  const lines = [
    '익명 민원 대화 기록',
    `익명 ID: ${session.anonymousId}`,
    `제목: ${session.title}`,
    `카테고리: ${session.category}`,
    `접수 시각: ${formatTranscriptTime(session.startedAt)}`,
    `종료 시각: ${formatTranscriptTime(session.closedAt)}`,
    `종료 사유: ${session.closeNote}`,
    '',
    '※ 봇이 보관한 계정 정보, 내부 메모 및 첨부파일 URL을 제외한 익명화 기록입니다.',
    ''
  ];

  for (const message of session.messages || []) {
    const speaker = message.role === 'admin' ? '관리자' : '민원인';
    lines.push(`[${formatTranscriptTime(message.timestamp)}] ${speaker}`);
    lines.push(message.content || '(내용 없음)', '');

    const attachments = (session.attachments || []).filter((attachment) => (
      attachment.role === message.role && attachment.timestamp === message.timestamp
    ));
    for (const attachment of attachments) {
      lines.push(`  첨부파일: ${attachment.filename || '이름 없음'} (URL 생략)`);
    }
    if (attachments.length) lines.push('');
  }

  return `\uFEFF${lines.join('\n').trimEnd()}\n`;
}

function formatTranscriptTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul'
  }).format(new Date(value));
}

module.exports = { closeComplaint, isClosing, buildAnonymousTranscript };
