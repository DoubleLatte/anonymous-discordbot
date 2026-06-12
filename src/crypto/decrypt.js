const crypto = require('node:crypto');
const fs = require('node:fs/promises');

async function decryptRecord(encPath, privateKeyPath) {
  const [payload, privateKey] = await Promise.all([
    fs.readFile(encPath),
    fs.readFile(privateKeyPath, 'utf8')
  ]);
  const version = payload.readUInt8(0);
  if (version !== 1) throw new Error(`Unsupported enc version: ${version}`);

  const encryptedKey = payload.subarray(1, 513);
  const iv = payload.subarray(513, 525);
  const authTag = payload.subarray(525, 541);
  const ciphertext = payload.subarray(541);
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      oaepHash: 'sha256',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    },
    encryptedKey
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const record = JSON.parse(plaintext.toString('utf8'));
  assertRecordNotExpired(record);
  return record;
}

function assertRecordNotExpired(record, now = new Date()) {
  if (!record.expiresAt) return;
  const expiresAt = new Date(record.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) throw new Error('Invalid record expiresAt value');
  if (now.getTime() > expiresAt.getTime()) {
    throw new Error(`This encrypted record expired at ${record.expiresAt} and cannot be decrypted.`);
  }
}

if (require.main === module) {
  const [encPath, privateKeyPath, outPath = 'plain.json'] = process.argv.slice(2);
  if (!encPath || !privateKeyPath) {
    console.error('Usage: node src/crypto/decrypt.js <record.enc> <private.pem> [plain.json]');
    process.exit(1);
  }
  decryptRecord(encPath, privateKeyPath)
    .then((record) => fs.writeFile(outPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8'))
    .then(() => console.log(`Decrypted record written to ${outPath}`))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { decryptRecord, assertRecordNotExpired };
