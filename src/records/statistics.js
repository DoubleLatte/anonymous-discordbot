const fs = require('node:fs/promises');
const path = require('node:path');

const filePath = path.join('records', 'stats-index.json');

async function loadClosedStats() {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendClosedStat(session) {
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
    attachmentCount: session.attachments.length
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
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

function isSameMonth(a, b) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

module.exports = { appendClosedStat, loadClosedStats, summarizeStats };
