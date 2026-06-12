const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');

const envPath = '.env';
const publicKeyPath = path.join('keys', 'public.pem');
const privateKeyPath = 'private.pem';

const fields = [
  ['DISCORD_TOKEN', 'Discord bot token', ''],
  ['CLIENT_ID', 'Discord application/client ID', ''],
  ['GUILD_ID', 'Discord server ID', ''],
  ['COMPLAINT_CATEGORY_ID', 'Complaint category ID', ''],
  ['LOG_CHANNEL_ID', 'Record/log channel ID', ''],
  ['ALERT_CHANNEL_ID', 'Alert channel ID', ''],
  ['ADMIN_ROLE_ID', 'Admin role ID', ''],
  ['SUPER_ADMIN_ID', 'Super admin user ID', ''],
  ['SESSION_TIMEOUT_HOURS', 'Session timeout hours', '24'],
  ['COOLDOWN_MINUTES', 'Cooldown minutes', '30'],
  ['RECORD_RETENTION_DAYS', 'Encrypted record retention days', '180'],
  ['WORK_HOURS_START', 'Work hours start(0-23)', '9'],
  ['WORK_HOURS_END', 'Work hours end(0-23)', '18'],
  ['WORK_HOURS_TIMEZONE', 'Work hours timezone', 'Asia/Seoul'],
  ['ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS', 'Accept outside work hours(true/false)', 'true'],
  ['MAX_ATTACHMENT_SIZE_MB', 'Max attachment size MB', '10']
];

async function main() {
  const existing = await readExistingEnv();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('Discord anonymous complaint bot setup');
  console.log('Press Enter to keep the value shown in parentheses.\n');

  const env = {};
  for (const [key, label, fallback] of fields) {
    const current = existing[key] || fallback;
    env[key] = await ask(rl, label, current);
  }

  env.PUBLIC_KEY_PATH = './keys/public.pem';
  env.REDIS_URL = await ask(rl, 'Redis URL, empty for file storage', existing.REDIS_URL || '');
  env.SESSION_ENCRYPTION_KEY = existing.SESSION_ENCRYPTION_KEY && existing.SESSION_ENCRYPTION_KEY !== 'base64-encoded-32-byte-key'
    ? existing.SESSION_ENCRYPTION_KEY
    : crypto.randomBytes(32).toString('base64');
  env.ENABLE_WORK_HOURS_NOTICE = await ask(rl, 'Show work hours notice(true/false)', existing.ENABLE_WORK_HOURS_NOTICE || 'true');

  const generateKeys = await askYesNo(rl, 'Generate RSA keys automatically?', !(await exists(publicKeyPath)));
  rl.close();

  if (generateKeys) await generateRsaKeys();
  await writeEnv(env);

  console.log('\nCreated configuration file: .env');
  if (generateKeys) {
    console.log(`Public key: ${publicKeyPath}`);
    console.log(`Private key: ${privateKeyPath}`);
    console.log('Important: move private.pem to the super admin PC and keep only public.pem on the bot server.');
  }

  console.log('\nNext steps:');
  console.log('1. npm run healthcheck');
  console.log('2. npm run deploy:commands');
  console.log('3. npm start');
}

async function ask(rl, label, current) {
  const suffix = current ? ` (${maskSecret(label, current)})` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || current;
}

async function askYesNo(rl, label, defaultValue) {
  const answer = await rl.question(`${label} (${defaultValue ? 'Y/n' : 'y/N'}): `);
  if (!answer.trim()) return defaultValue;
  return ['y', 'yes'].includes(answer.trim().toLowerCase());
}

function maskSecret(label, value) {
  if (!/token/i.test(label)) return value;
  if (value.length <= 8) return 'entered';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function generateRsaKeys() {
  await fs.mkdir('keys', { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  await fs.writeFile(publicKeyPath, publicKey, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
    await fs.writeFile(publicKeyPath, publicKey);
  });
  await fs.writeFile(privateKeyPath, privateKey, { flag: 'wx' }).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
    await fs.writeFile(privateKeyPath, privateKey);
  });
}

async function writeEnv(env) {
  const ordered = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'GUILD_ID',
    'COMPLAINT_CATEGORY_ID',
    'LOG_CHANNEL_ID',
    'ALERT_CHANNEL_ID',
    'ADMIN_ROLE_ID',
    'SUPER_ADMIN_ID',
    'SESSION_TIMEOUT_HOURS',
    'COOLDOWN_MINUTES',
    'RECORD_RETENTION_DAYS',
    'WORK_HOURS_START',
    'WORK_HOURS_END',
    'WORK_HOURS_TIMEZONE',
    'ACCEPT_COMPLAINTS_OUTSIDE_WORK_HOURS',
    'PUBLIC_KEY_PATH',
    'REDIS_URL',
    'SESSION_ENCRYPTION_KEY',
    'MAX_ATTACHMENT_SIZE_MB',
    'ENABLE_WORK_HOURS_NOTICE'
  ];
  const lines = ordered.map((key) => `${key}=${envValue(env[key] || '')}`);
  await fs.writeFile(envPath, `${lines.join('\n')}\n`, 'utf8');
}

function envValue(value) {
  if (/[\s#"'=]/.test(value)) return JSON.stringify(value);
  return value;
}

async function readExistingEnv() {
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        const value = line.slice(index + 1).replace(/^"(.*)"$/, '$1');
        return [key, value];
      }));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function exists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
