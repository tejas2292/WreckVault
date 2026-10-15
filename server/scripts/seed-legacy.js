// Seeds a v1 ("legacy") account for local testing of the v1 -> v2 upgrade.
//   DATABASE_URL=postgres://...  node scripts/seed-legacy.js
// Creates user `alice` / `correct horse battery staple` with 12 v1 vault_entries
// (10 decryptable, 2 encrypted with a different password). Skips if alice exists.
// Needs dev dependencies (crypto-js), so run it from a checkout, not the production image.
require('dotenv').config({ quiet: true });
const { createPool, migrate } = require('../db');
const { createV1User, createV1Entry, SAMPLE_ENTRIES } = require('./legacy-fixtures');

const USERNAME = 'alice';
const PASSWORD = 'correct horse battery staple';

const main = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL to the database to seed.');
    process.exit(1);
  }
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [USERNAME]);
    if (existing.rows.length) {
      console.log(`User ${USERNAME} already exists (id ${existing.rows[0].id}); nothing to do.`);
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await createV1User(client, USERNAME, PASSWORD);
      for (const entry of SAMPLE_ENTRIES) await createV1Entry(client, user.id, PASSWORD, entry);
      await client.query('COMMIT');
      console.log(`Created v1 user ${USERNAME} (id ${user.id}) with ${SAMPLE_ENTRIES.length} entries.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
