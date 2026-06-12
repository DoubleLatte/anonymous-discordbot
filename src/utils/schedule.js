const config = require('../config');

function isOutsideWorkHours(date = new Date()) {
  const hour = getHourInTimezone(date, config.workHoursTimezone);
  if (config.workHoursStart === config.workHoursEnd) return false;
  if (config.workHoursStart < config.workHoursEnd) {
    return hour < config.workHoursStart || hour >= config.workHoursEnd;
  }
  return hour >= config.workHoursEnd && hour < config.workHoursStart;
}

function workHoursText() {
  if (config.workHoursStart === config.workHoursEnd) return '24시간';
  return `${config.workHoursStart}:00-${config.workHoursEnd}:00 (${config.workHoursTimezone})`;
}

function isTimedOut(session, now = Date.now()) {
  return now - new Date(session.updatedAt).getTime() >= config.sessionTimeoutHours * 60 * 60 * 1000;
}

function getHourInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return hour === 24 ? 0 : hour;
}

module.exports = { isOutsideWorkHours, isTimedOut, workHoursText };
