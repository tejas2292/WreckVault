require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize Database Schema
const initDb = async (retries = 5) => {
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
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;`);
      } catch (e) {
        console.log("Migration note: profile_image column might already exist or failed " + e.message);
      }

      console.log('Database Schema Ready.');
      return; 
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`Error connecting to database (retries left: ${retries}):`, err.message);
      retries -= 1;
      if (retries === 0) {
        console.error("Could not connect to database after multiple attempts.");
        process.exit(1);
      }
      // Wait 5 seconds before retrying
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

module.exports = { pool, initDb };
