const crypto = require('node:crypto');

function generateAnonymousId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = { generateAnonymousId };
