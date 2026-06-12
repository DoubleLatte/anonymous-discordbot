const blockedUsers = new Set();
const cooldownUntil = new Map();
const recentMessages = new Map();

function replaceState(state) {
  blockedUsers.clear();
  cooldownUntil.clear();
  for (const userId of state.blockedUsers || []) blockedUsers.add(userId);
  for (const [userId, until] of state.cooldownUntil || []) {
    if (Number(until) > Date.now()) cooldownUntil.set(userId, Number(until));
  }
}

function snapshotState() {
  return {
    blockedUsers: [...blockedUsers],
    cooldownUntil: [...cooldownUntil.entries()].filter(([, until]) => until > Date.now())
  };
}

function isBlocked(userId) {
  return blockedUsers.has(userId);
}

function block(userId) {
  blockedUsers.add(userId);
}

function unblock(userId) {
  blockedUsers.delete(userId);
}

function setCooldown(userId, minutes) {
  cooldownUntil.set(userId, Date.now() + minutes * 60 * 1000);
}

function getCooldownRemainingMs(userId) {
  const until = cooldownUntil.get(userId) || 0;
  return Math.max(0, until - Date.now());
}

function isFlooding(userId, limit = 5, windowMs = 10000) {
  const now = Date.now();
  const history = (recentMessages.get(userId) || []).filter((time) => now - time <= windowMs);
  history.push(now);
  recentMessages.set(userId, history);
  return history.length > limit;
}

module.exports = {
  replaceState,
  snapshotState,
  isBlocked,
  block,
  unblock,
  setCooldown,
  getCooldownRemainingMs,
  isFlooding
};
