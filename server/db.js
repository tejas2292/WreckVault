// Database pool, schema migrations and the cold-boot retry loop.
// Environment comes from real env vars; server/.env is optional (dotenv never fails when it is absent).
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const { Pool } = require("pg");

const createPool = (connectionString = process.env.DATABASE_URL) => {
  const p = new Pool({ connectionString });
  // An idle client losing its connection (e.g. Postgres restarting) must not crash the API.
  p.on("error", (err) => console.error("Postgres pool error:", err.message));
  return p;
};

const pool = createPool();

// v1 schema (unchanged) followed by the additive v2 migrations from docs/V2-SPEC.md §1.
// Nothing here drops, truncates, deletes from or updates existing rows.
const V1_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     username VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE TABLE IF NOT EXISTS vault_entries (
     id SERIAL PRIMARY KEY,
     user_id INTEGER REFERENCES users(id),
     service_name VARCHAR(255) NOT NULL,
     account_username VARCHAR(255),
     encrypted_blob TEXT NOT NULL,
     iv VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT`,
  `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS website_url VARCHAR(255)`,
  `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other'`,
  `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'password'`,
  `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS login_logs (
     id SERIAL PRIMARY KEY,
     username VARCHAR(255),
     ip_address VARCHAR(100),
     success BOOLEAN NOT NULL,
     user_agent TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs (created_at DESC)`,
];

const V2_STATEMENTS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS kdf_salt TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS kdf_params JSONB`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS wrapped_vault_key TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS upgraded_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS collections (
     id UUID PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     kind VARCHAR(20) NOT NULL DEFAULT 'custom',
     agent_access BOOLEAN NOT NULL DEFAULT false,
     wrapped_key TEXT NOT NULL,
     sort INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS items (
     id UUID PRIMARY KEY,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     collection_id UUID NOT NULL REFERENCES collections(id),
     type VARCHAR(32) NOT NULL,
     encrypted TEXT NOT NULL,
     legacy_entry_id INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     deleted_at TIMESTAMPTZ,
     UNIQUE (user_id, legacy_entry_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_items_user ON items (user_id)`,
  `CREATE TABLE IF NOT EXISTS item_history (
     id SERIAL PRIMARY KEY,
     item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     collection_id UUID NOT NULL,
     type VARCHAR(32) NOT NULL,
     encrypted TEXT NOT NULL,
     version_updated_at TIMESTAMPTZ NOT NULL,
     replaced_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_item_history_item ON item_history (item_id)`,
];

// Runs every migration and makes sure the JWT secret exists. Safe to run on every boot.
const migrate = async (db) => {
  for (const sql of [...V1_STATEMENTS, ...V2_STATEMENTS]) {
    await db.query(sql);
  }
  await db.query(
    `INSERT INTO server_settings (key, value) VALUES ('jwt_secret', $1)
     ON CONFLICT (key) DO NOTHING`,
    [crypto.randomBytes(48).toString("base64")],
  );
};

// Retry for ~2.5 minutes. Postgres and this service start in parallel on host boot;
// after 30 x 5 s the process exits 1 so Docker's restart policy takes over.
const initDb = async (db = pool, retries = 30, delayMs = 5000) => {
  while (retries > 0) {
    try {
      console.log("Initializing Database Schema...");
      await migrate(db);
      console.log("Database Schema Ready.");
      return;
    } catch (err) {
      retries -= 1;
      console.error(
        `Error preparing database (retries left: ${retries}):`,
        err.message,
      );
      if (retries === 0) {
        console.error("Could not connect to database after multiple attempts.");
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
};

module.exports = { pool, createPool, migrate, initDb };
