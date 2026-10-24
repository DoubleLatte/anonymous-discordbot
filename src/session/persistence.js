const path = require('node:path');
const { createEncryptedStore } = require('../storage/encryptedStore');

const store = createEncryptedStore({
  label: 'encrypted sessions',
  redisKey: 'complaint-bot:sessions',
  filePath: path.join('sessions', 'sessions.enc.json'),
  empty: () => []
});

module.exports = { loadSessions: store.load, saveSessions: store.save };
