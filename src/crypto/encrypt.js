const crypto = require('node:crypto');
const fs = require('node:fs/promises');

async function encryptRecord(record, publicKeyPath) {
  const publicKey = await fs.readFile(publicKeyPath, 'utf8');
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKey,
      oaepHash: 'sha256',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    },
    aesKey
  );

  if (encryptedKey.length !== 512) {
    throw new Error('RSA public key must be 4096-bit so encryptedKey is 512 bytes');
  }

  return Buffer.concat([Buffer.from([1]), encryptedKey, iv, authTag, ciphertext]);
}

module.exports = { encryptRecord };
