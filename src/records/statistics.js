const fs = require('node:fs/promises');
const path = require('node:path');
const { createSerialQueue, writeJsonAtomic } = require('../storage/fileIO');

const filePath = path.join('records', 'stats-index.json');
const updateIndex = createSerialQueue();

async function loadClosedStats() {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendClosedStat(session) {
  const snapshot = structuredClone(session);
  return updateIndex(() => appendClosedStatUnlocked(snapshot));
}

async function appendClosedStatUnlocked(session) {
  const stats = await loadClosedStats();
  stats.push({
    anonymousId: session.anonymousId,
    category: session.category,
    priority: session.priority,
    status: 'completed',
    closeReason: session.closeReason,
    startedAt: session.startedAt,
    closedAt: session.closedAt,
    durationMs: new Date(session.closedAt).getTime() - new Date(session.startedAt).getTime(),
    messageCount: session.messages.length,
    attachmentCount: session.attachments.length,
    archiveChannelId: session.archiveChannelId,
    archiveMessageId: session.archiveMessageId,
    archiveDeleteAt: session.archiveDeleteAt
  });
  await saveClosedStats(stats);
}

async function saveClosedStats(stats) {
  await writeJsonAtomic(filePath, stats);
}

async function cleanupExpiredArchives(client, now = new Date()) {
  // 추가와 삭제 결과의 읽기-수정-쓰기를 같은 큐에서 처리해야 만료 정보가 유실되지 않습니다.
  return updateIndex(() => cleanupExpiredArchivesUnlocked(client, now));
}

async function cleanupExpiredArchivesUnlocked(client, now) {
  const stats = await loadClosedStats();
  let changed = false;
  let deleted = 0;
  let failed = 0;

  for (const item of stats) {
    if (item.archiveDeletedAt || !item.archiveDeleteAt || !item.archiveChannelId || !item.archiveMessageId) continue;
    if (new Date(item.archiveDeleteAt).getTime() > now.getTime()) continue;

    try {
      const channel = await client.channels.fetch(item.archiveChannelId);
      if (!channel?.isTextBased() || !channel.messages) throw new Error('Archive channel is unavailable');
      const message = await channel.messages.fetch(item.archiveMessageId);
      await message.delete();
      item.archiveDeletedAt = now.toISOString();
      deleted += 1;
      changed = true;
    } catch (error) {
      if (error?.code === 10008 || error?.rawError?.code === 10008) {
        item.archiveDeletedAt = now.toISOString();
        deleted += 1;
        changed = true;
      } else {
        failed += 1;
      }
    }
  }

  if (changed) await saveClosedStats(stats);
  return { deleted, failed };
}

function summarizeStats(activeSessions, closedStats) {
  const closedThisMonth = closedStats.filter((item) => isSameMonth(new Date(item.closedAt), new Date()));
  const totalDuration = closedStats.reduce((sum, item) => sum + Math.max(0, item.durationMs || 0), 0);
  return {
    activeCount: activeSessions.length,
    closedCount: closedStats.length,
    closedThisMonthCount: closedThisMonth.length,
    byCategory: countBy([...activeSessions, ...closedStats], 'category'),
    byPriority: countBy([...activeSessions, ...closedStats], 'priority'),
    byStatus: countBy([...activeSessions, ...closedStats], 'status'),
    autoClosedCount: closedStats.filter((item) => item.closeReason === 'timeout').length,
    averageDurationMs: closedStats.length ? Math.round(totalDuration / closedStats.length) : 0
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

// 운영 기준인 한국 시간으로 월을 비교합니다. UTC로 비교하면 매월 1일 0~9시 종료 건이 전월로 집계됩니다.
const monthFormat = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Seoul' });

function isSameMonth(a, b) {
  return monthFormat.format(a) === monthFormat.format(b);
}

module.exports = { appendClosedStat, loadClosedStats, summarizeStats, cleanupExpiredArchives };
