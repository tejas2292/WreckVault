require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize DB on start
initDb();

// --- Auth Routes ---

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    // Check if user exists
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Insert user
    const newUser = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hash]
    );

    res.json({ user: newUser.rows[0], message: "Registration successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // For simplicity in this demo, we return the user ID. 
    // In production, use JWT or Session Cookies.
    // We will just send back the user ID to store in client memory state.
    res.json({ 
      message: "Login successful", 
      user: { id: user.id, username: user.username, created_at: user.created_at } 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get User Profile (Protected)
app.get('/api/auth/me', async (req, res) => {
  // Prototype: Use header for ID again. Real apps use JWT.
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userResult = await pool.query('SELECT id, username, created_at, profile_image FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });

    res.json({ user: userResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Update User Profile
app.put('/api/auth/me', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { profile_image } = req.body;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await pool.query(
      'UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING id, username, created_at, profile_image',
      [profile_image, userId]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// --- Vault Routes ---
// Note: In production, these should be protected by middleware verifying session/JWT.
// For this prototype, we will trust the 'user_id' sent in the headers or body,
// or just implemented simply. Let's use a header 'x-user-id' for simplicity 
// to avoid implementing full JWT infrastructure in this single pass.

const requireAuth = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

// GET all passwords
app.get('/api/vault', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch vault" });
  }
});

// POST (Add) password to vault
app.post('/api/vault', requireAuth, async (req, res) => {
  const { service_name, account_username, encrypted_blob, iv, website_url } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO vault_entries (user_id, service_name, account_username, encrypted_blob, iv, website_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.userId, service_name, account_username, encrypted_blob, iv, website_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add entry" });
  }
});

// PUT (Update) password
app.put('/api/vault/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { service_name, account_username, encrypted_blob, iv, website_url } = req.body;

  try {
    const result = await pool.query(
      `UPDATE vault_entries 
       SET service_name = $1, account_username = $2, encrypted_blob = $3, iv = $4, website_url = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [service_name, account_username, encrypted_blob, iv, website_url, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Entry not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

// DELETE password
app.delete('/api/vault/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      'DELETE FROM vault_entries WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    res.json({ message: "Entry deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
