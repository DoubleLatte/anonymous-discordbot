const fs = require('node:fs/promises');
const path = require('node:path');

async function write(level, message, meta) {
  const now = new Date();
  const line = formatLine(level, message, meta, now);
  try {
    await fs.mkdir('logs', { recursive: true });
    await fs.appendFile(path.join('logs', `${dateStamp(now)}.log`), `${line}\n`, 'utf8');
  } catch {
    // Avoid recursive logging failures.
  }

  const consoleLine = formatLine(level, message, meta, now, { compact: true });
  if (level === 'error') console.error(consoleLine);
  else if (level === 'warn') console.warn(consoleLine);
  else console.log(consoleLine);
}

function formatLine(level, message, meta, date, options = {}) {
  const time = timeStamp(date);
  const label = level.toUpperCase().padEnd(5, ' ');
  const detail = formatMeta(meta, options);
  return detail ? `[${time}] [${label}] ${message}\n${detail}` : `[${time}] [${label}] ${message}`;
}

function formatMeta(meta, options = {}) {
  if (!meta) return '';
  if (meta instanceof Error) {
    if (options.compact) return `  -> ${meta.name}: ${meta.message}`;
    return [
      `  error: ${meta.name}: ${meta.message}`,
      ...(meta.stack ? meta.stack.split('\n').slice(1).map((line) => `  ${line.trim()}`) : [])
    ].join('\n');
  }
  if (typeof meta === 'string') return `  -> ${meta}`;
  return Object.entries(meta)
    .map(([key, value]) => `  ${key}: ${formatValue(value)}`)
    .join('\n');
}

function formatValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function timeStamp(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Seoul'
  }).format(date);
}

function dateStamp(date) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Seoul'
  }).format(date);
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta)
};
