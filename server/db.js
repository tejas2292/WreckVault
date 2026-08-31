require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Database Schema
// Retry for ~2.5 minutes. Postgres and this service start in parallel on
// host boot; the old 5 x 5s = 25s window expired before Postgres was
// accepting connections, and the process exited for good.
const initDb = async (retries = 30) => {
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        console.log("Initializing Database Schema...");

        // Users Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Passwords Table (Vault Entries)
        await pool.query(`
        CREATE TABLE IF NOT EXISTS vault_entries (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          service_name VARCHAR(255) NOT NULL,
          account_username VARCHAR(255),
          encrypted_blob TEXT NOT NULL,
          iv VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

        // Migration: Add profile_image to users if it doesn't exist
        try {
          await pool.query(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;`,
          );
        } catch (e) {
          console.log(
            "Migration note: profile_image column might already exist or failed " +
              e.message,
          );
        }

        // Migration: Add website_url to vault_entries
        try {
          await pool.query(
            `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);`,
          );
        } catch (e) {
          console.log(
            "Migration note: website_url column might already exist " +
              e.message,
          );
        }

        // Migration: Add category to vault_entries
        try {
          await pool.query(
            `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other';`,
          );
        } catch (e) {
          console.log(
            "Migration note: category column might already exist " +
              e.message,
          );
        }

        // Migration: Add entry_type to vault_entries
        try {
          await pool.query(
            `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'password';`,
          );
        } catch (e) {
          console.log(
            "Migration note: entry_type column might already exist " +
              e.message,
          );
        }

        // Migration: Add is_favorite to vault_entries
        try {
          await pool.query(
            `ALTER TABLE vault_entries ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;`,
          );
        } catch (e) {
          console.log(
            "Migration note: is_favorite column might already exist " +
              e.message,
          );
        }

        // Migration: Add login_logs table (login attempt audit trail - username, IP, success, timestamp)
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS login_logs (
              id SERIAL PRIMARY KEY,
              username VARCHAR(255),
              ip_address VARCHAR(100),
              success BOOLEAN NOT NULL,
              user_agent TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs (created_at DESC);`,
          );
        } catch (e) {
          console.log(
            "Migration note: login_logs table might already exist " +
              e.message,
          );
        }

        console.log("Database Schema Ready.");
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(
        `Error connecting to database (retries left: ${retries}):`,
        err.message,
      );
      retries -= 1;
      if (retries === 0) {
        console.error("Could not connect to database after multiple attempts.");
        process.exit(1);
      }
      // Wait 5 seconds before retrying
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
};

module.exports = { pool, initDb };
