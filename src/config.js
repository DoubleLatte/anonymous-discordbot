require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optionalNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid number env: ${name}`);
  return value;
}

function optionalBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
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
  sessionTimeoutHours: optionalNumber('SESSION_TIMEOUT_HOURS', 24),
  cooldownMinutes: optionalNumber('COOLDOWN_MINUTES', 30),
  recordRetentionDays: optionalNumber('RECORD_RETENTION_DAYS', 180),
  workHoursStart: optionalNumber('WORK_HOURS_START', 9),
  workHoursEnd: optionalNumber('WORK_HOURS_END', 18),
  workHoursTimezone: process.env.WORK_HOURS_TIMEZONE || 'Asia/Seoul',
  acceptComplaintsOutsideWorkHours: optionalBoolean('ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS', true),
  publicKeyPath: process.env.PUBLIC_KEY_PATH || './keys/public.pem',
  redisUrl: process.env.REDIS_URL || '',
  sessionEncryptionKey: required('SESSION_ENCRYPTION_KEY'),
  maxAttachmentSizeMb: optionalNumber('MAX_ATTACHMENT_SIZE_MB', 10),
  enableWorkHoursNotice: optionalBoolean('ENABLE_WORK_HOURS_NOTICE', true)
};
