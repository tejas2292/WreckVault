// Creates v1-style users and vault_entries exactly the way the v1 app wrote them:
// password_hash = bcryptjs hash (cost 10) of the raw password, and every blob is
// CryptoJS.AES.encrypt(text, rawPassword).toString(); card and note blobs are JSON strings.
// Used by the tests and by scripts/seed-legacy.js. Fake data only.
const bcrypt = require('bcryptjs');
const CryptoJS = require('crypto-js');

const encryptV1 = (text, password) => CryptoJS.AES.encrypt(text, password).toString();

const createV1User = async (db, username, password) => {
  const hash = await bcrypt.hash(password, 10);
  const r = await db.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *',
    [username, hash],
  );
  return r.rows[0];
};

// entry: {serviceName, accountUsername?, websiteUrl?, category?, entryType?, isFavorite?,
//         secret (string, or object for card/note), encryptWith? (defaults to password)}
const createV1Entry = async (db, userId, password, entry) => {
  const plaintext = typeof entry.secret === 'string' ? entry.secret : JSON.stringify(entry.secret);
  const blob = encryptV1(plaintext, entry.encryptWith || password);
  const r = await db.query(
    `INSERT INTO vault_entries
       (user_id, service_name, account_username, encrypted_blob, iv, website_url, category, entry_type, is_favorite)
     VALUES ($1, $2, $3, $4, 'embedded-in-blob', $5, $6, $7, $8) RETURNING *`,
    [
      userId,
      entry.serviceName,
      entry.accountUsername || null,
      blob,
      entry.websiteUrl || null,
      entry.category || 'other',
      entry.entryType || 'password',
      entry.isFavorite === true,
    ],
  );
  return r.rows[0];
};

const OTHER_PASSWORD = 'an older master password';

// A realistic mix: passwords with categories and favourites, cards, notes, and two rows
// encrypted with a different password (so they can't be decrypted with the current one).
const SAMPLE_ENTRIES = [
  { serviceName: 'Example Mail', accountUsername: 'alice@example.com', websiteUrl: 'https://mail.example.com', category: 'email', isFavorite: true, secret: 'mail-Pa55word!' },
  { serviceName: 'Code Host', accountUsername: 'alice', websiteUrl: 'https://git.example.com', category: 'development', isFavorite: true, secret: 'gh-9xT#q2LmZ' },
  { serviceName: 'Home Router', accountUsername: 'admin', websiteUrl: 'http://10.0.0.1', category: 'network', secret: 'router-admin-123' },
  { serviceName: 'Staging DB', accountUsername: 'app_user', websiteUrl: '', category: 'database', secret: 'db-s3cret-value' },
  { serviceName: 'Build Server', accountUsername: 'deploy', websiteUrl: 'https://ci.example.com', category: 'devops', secret: 'ci-token-abc123' },
  { serviceName: 'Social Site', accountUsername: 'alice_example', websiteUrl: 'https://social.example.org', category: 'social', secret: 'soc1al-pw' },
  { serviceName: 'Plain Entry', accountUsername: '', websiteUrl: '', category: 'other', secret: 'just-a-password' },
  {
    serviceName: 'Everyday Visa', entryType: 'card', category: 'finance', isFavorite: true,
    secret: { cardholder_name: 'Alice Example', card_number: '4111111111111111', expiry_month: '04', expiry_year: '2029', cvv: '123', card_type: 'visa' },
  },
  {
    serviceName: 'Backup Mastercard', entryType: 'card', category: 'finance',
    secret: { cardholder_name: 'Alice Example', card_number: '5555555555554444', expiry_month: '11', expiry_year: '27', cvv: '456', card_type: 'mastercard' },
  },
  { serviceName: 'Recovery codes', entryType: 'note', category: 'other', secret: { content: 'code-1111\ncode-2222\ncode-3333' } },
  { serviceName: 'Old Forum', accountUsername: 'alice', websiteUrl: 'https://forum.example.net', category: 'social', secret: 'forum-old-pw', encryptWith: OTHER_PASSWORD },
  { serviceName: 'Old Note', entryType: 'note', category: 'other', secret: { content: 'written before a password change' }, encryptWith: OTHER_PASSWORD },
];

module.exports = { encryptV1, createV1User, createV1Entry, SAMPLE_ENTRIES, OTHER_PASSWORD };
