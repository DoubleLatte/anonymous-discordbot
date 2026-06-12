const sessions = new Map();

function all() {
  return [...sessions.values()];
}

function replaceAll(values) {
  sessions.clear();
  for (const session of values || []) sessions.set(session.anonymousId, session);
}

function set(session) {
  sessions.set(session.anonymousId, { ...session, updatedAt: new Date().toISOString() });
}

function getByAnonymousId(anonymousId) {
  return sessions.get(anonymousId);
}

function getByChannelId(channelId) {
  return all().find((session) => session.channelId === channelId);
}

function getByComplainantId(complainantId) {
  return all().find((session) => session.complainantId === complainantId);
}

function remove(anonymousId) {
  sessions.delete(anonymousId);
}

module.exports = { all, replaceAll, set, getByAnonymousId, getByChannelId, getByComplainantId, remove };
