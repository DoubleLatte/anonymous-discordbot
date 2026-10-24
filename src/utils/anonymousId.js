const crypto = require('node:crypto');
const sessionStore = require('../session/sessionStore');

const reservations = new Set();

function generateAnonymousId() {
  // 채널 생성의 await 사이에도 다른 접수가 같은 ID를 가져가지 못하게 예약합니다.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = crypto.randomBytes(16).toString('hex').toUpperCase();
    if (reservations.has(id) || sessionStore.getByAnonymousId(id)) continue;
    reservations.add(id);
    return id;
  }
  throw new Error('Could not allocate a unique complaint ID');
}

function releaseAnonymousId(id) {
  reservations.delete(id);
}

module.exports = { generateAnonymousId, releaseAnonymousId };
