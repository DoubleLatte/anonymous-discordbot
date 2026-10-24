const sessions = new Map();

function all() {
  return [...sessions.values()];
}

function replaceAll(values) {
  const restored = new Map();
  for (const session of values || []) {
    if (restored.has(session.anonymousId)) throw new Error('Duplicate anonymous ID in saved sessions');
    restored.set(session.anonymousId, session);
  }
  sessions.clear();
  for (const [id, session] of restored) sessions.set(id, session);
}

function set(session) {
  const existing = sessions.get(session.anonymousId);
  if (existing && (existing.complainantId !== session.complainantId || existing.channelId !== session.channelId)) {
    throw new Error('Anonymous ID already belongs to another complaint');
  }
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
