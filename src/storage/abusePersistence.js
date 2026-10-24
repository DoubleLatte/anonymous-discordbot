const path = require('node:path');
const { createEncryptedStore } = require('./encryptedStore');

const store = createEncryptedStore({
  label: 'abuse state',
  redisKey: 'complaint-bot:abuse-state',
  filePath: path.join('sessions', 'abuse-state.enc.json'),
  empty: () => ({ blockedUsers: [], cooldownUntil: [] })
});

module.exports = { loadAbuseState: store.load, saveAbuseState: store.save };
