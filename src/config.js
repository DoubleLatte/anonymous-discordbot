require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optionalNumber(name, fallback, { min = 0, max = Infinity, integer = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid number env: ${name}`);
  }
  return value;
}

function optionalBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  // 오타를 false로 간주하면 접수 정책이 의도와 다르게 바뀔 수 있습니다.
  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new Error(`Invalid boolean env: ${name}`);
}

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  complaintCategoryId: required('COMPLAINT_CATEGORY_ID'),
  logChannelId: required('LOG_CHANNEL_ID'),
  alertChannelId: required('ALERT_CHANNEL_ID'),
  adminRoleId: required('ADMIN_ROLE_ID'),
  superAdminId: required('SUPER_ADMIN_ID'),
  sessionTimeoutHours: optionalNumber('SESSION_TIMEOUT_HOURS', 24, { min: Number.MIN_VALUE }),
  cooldownMinutes: optionalNumber('COOLDOWN_MINUTES', 30),
  recordRetentionDays: optionalNumber('RECORD_RETENTION_DAYS', 14, { min: 1, integer: true }),
  workHoursStart: optionalNumber('WORK_HOURS_START', 9, { max: 23, integer: true }),
  workHoursEnd: optionalNumber('WORK_HOURS_END', 18, { max: 23, integer: true }),
  workHoursTimezone: process.env.WORK_HOURS_TIMEZONE || 'Asia/Seoul',
  acceptComplaintsOutsideWorkHours: optionalBoolean('ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS', true),
  publicKeyPath: process.env.PUBLIC_KEY_PATH || './keys/public.pem',
  redisUrl: process.env.REDIS_URL || '',
  sessionEncryptionKey: required('SESSION_ENCRYPTION_KEY'),
  maxAttachmentSizeMb: optionalNumber('MAX_ATTACHMENT_SIZE_MB', 10, { min: 1 }),
  enablePlaintextArchive: optionalBoolean('ENABLE_PLAINTEXT_ARCHIVE', false),
  enableWorkHoursNotice: optionalBoolean('ENABLE_WORK_HOURS_NOTICE', true)
};
