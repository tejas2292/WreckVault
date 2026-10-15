// /api/auth/* and /api/legacy/* routes.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { ah, HttpError, withTx, isUniqueViolation, clientIp } = require('../lib/http');
const {
  DEFAULT_KDF_PARAMS, isNonEmptyString, isKdf, checkCollections,
} = require('../lib/validate');
const { toSession, toUser, toLegacyEntry, toLoginLog } = require('../lib/rows');
const { checkItem, insertCollections, insertItem } = require('./vault');

const INVALID = 'Invalid credentials';

const createAuthRouter = ({ pool, session, bcryptCost }) => {
  const router = express.Router();
  const { setSession, clearSession, requireSession, requireV2, getSecret } = session;

  // Hash compared against when the username is unknown, so response time doesn't reveal it.
  let dummyHash = null;
  const getDummyHash = async () => {
    if (!dummyHash) dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), bcryptCost);
    return dummyHash;
  };

  const registrationOpen = async () => {
    if (process.env.ALLOW_REGISTRATION === 'true') return true;
    const r = await pool.query('SELECT EXISTS (SELECT 1 FROM users) AS any');
    return !r.rows[0].any;
  };

  // Max 4 failed logins per IP per 15 minutes; successful logins don't count.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 4,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  });

  const preloginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
  });

  router.get('/auth/status', ah(async (req, res) => {
    res.json({ registrationOpen: await registrationOpen() });
  }));

  router.post('/auth/prelogin', preloginLimiter, ah(async (req, res) => {
    const { username } = req.body || {};
    if (!isNonEmptyString(username, 255)) throw new HttpError(400, 'Enter your username.');
    const r = await pool.query('SELECT auth_version, kdf_salt, kdf_params FROM users WHERE username = $1', [username]);
    const user = r.rows[0];
    if (user && user.auth_version === 1) return res.json({ authVersion: 1 });
    if (user && user.auth_version === 2) {
      return res.json({ authVersion: 2, kdf: { salt: user.kdf_salt, params: user.kdf_params } });
    }
    // Unknown user: a stable, v2-shaped answer so usernames can't be probed.
    const salt = crypto
      .createHmac('sha256', await getSecret())
      .update(`prelogin:${username}`)
      .digest()
      .subarray(0, 16)
      .toString('base64');
    res.json({ authVersion: 2, kdf: { salt, params: { ...DEFAULT_KDF_PARAMS } } });
  }));

  router.post('/auth/login', loginLimiter, ah(async (req, res) => {
    const { username, password, authHash } = req.body || {};
    const userAgent = req.headers['user-agent'] || null;
    const logAttempt = async (success) => {
      try {
        await pool.query(
          'INSERT INTO login_logs (username, ip_address, success, user_agent) VALUES ($1, $2, $3, $4)',
          [typeof username === 'string' ? username : null, clientIp(req), success, userAgent],
        );
      } catch (logErr) {
        console.error('Failed to write login log:', logErr.message);
      }
    };
    const fail = async () => {
      await logAttempt(false);
      res.status(400).json({ error: INVALID });
    };

    const user = typeof username === 'string'
      ? (await pool.query('SELECT * FROM users WHERE username = $1', [username])).rows[0]
      : undefined;
    if (!user) {
      await bcrypt.compare('not-a-real-password', await getDummyHash());
      return fail();
    }

    let ok = false;
    if (user.auth_version === 1) {
      // A v1 account signs in with the raw password only.
      if (typeof password === 'string' && authHash === undefined) {
        ok = await bcrypt.compare(password, user.password_hash);
      }
    } else if (user.auth_version === 2) {
      if (typeof authHash === 'string' && password === undefined && user.auth_hash) {
        ok = await bcrypt.compare(authHash, user.auth_hash);
      }
    }
    if (!ok) return fail();

    await logAttempt(true);
    await setSession(req, res, user);
    res.json(toSession(user));
  }));

  router.post('/auth/logout', (req, res) => {
    clearSession(req, res);
    res.json({ ok: true });
  });

  router.post('/auth/register', ah(async (req, res) => {
    if (!(await registrationOpen())) {
      throw new HttpError(403, 'Registration is closed on this server. Ask the administrator for an account.');
    }
    const { username, authHash, kdf, wrappedVaultKey, collections } = req.body || {};
    if (!isNonEmptyString(username, 255)) throw new HttpError(400, 'Choose a username of up to 255 characters.');
    if (!isNonEmptyString(authHash)) throw new HttpError(400, 'authHash is required.');
    if (!isKdf(kdf)) throw new HttpError(400, 'kdf must be {salt: base64 of 16 bytes, params: {...}}.');
    if (!isNonEmptyString(wrappedVaultKey)) throw new HttpError(400, 'wrappedVaultKey is required.');
    const collErr = checkCollections(collections);
    if (collErr) throw new HttpError(400, collErr);

    const hash = await bcrypt.hash(authHash, bcryptCost);
    const user = await withTx(pool, async (db) => {
      const taken = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
      if (taken.rows.length) throw new HttpError(400, 'That username is taken. Choose another one.');
      let inserted;
      try {
        inserted = await db.query(
          `INSERT INTO users (username, password_hash, auth_version, auth_hash, kdf_salt, kdf_params, wrapped_vault_key)
           VALUES ($1, $2, 2, $3, $4, $5, $6) RETURNING *`,
          [username, hash, hash, kdf.salt, JSON.stringify(kdf.params), wrappedVaultKey],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(400, 'That username is taken. Choose another one.');
        throw err;
      }
      const u = inserted.rows[0];
      await insertCollections(db, u.id, collections);
      return u;
    });

    await setSession(req, res, user);
    res.json(toSession(user));
  }));

  router.get('/auth/me', requireSession, (req, res) => {
    res.json(toSession(req.user));
  });

  router.put('/auth/me', requireSession, ah(async (req, res) => {
    const { profileImage } = req.body || {};
    if (profileImage !== null && !(typeof profileImage === 'string' && /^data:image\/[a-z0-9.+-]+[;,]/i.test(profileImage))) {
      throw new HttpError(400, 'profileImage must be an image data URL or null.');
    }
    const r = await pool.query(
      'UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING id, username, created_at, profile_image',
      [profileImage, req.user.id],
    );
    res.json({ user: toUser(r.rows[0]) });
  }));

  // Deletes the account and everything it owns. This is the only route that removes
  // vault_entries rows or the users row (v1 behaviour, on purpose).
  router.delete('/auth/me', requireSession, ah(async (req, res) => {
    const { password, authHash } = req.body || {};
    const u = req.user;
    let ok = false;
    if (u.auth_version === 1 && typeof password === 'string') {
      ok = await bcrypt.compare(password, u.password_hash);
    } else if (u.auth_version === 2 && typeof authHash === 'string' && u.auth_hash) {
      ok = await bcrypt.compare(authHash, u.auth_hash);
    }
    if (!ok) throw new HttpError(400, 'That master password is wrong. Enter it again to delete the account.');

    await withTx(pool, async (db) => {
      await db.query('DELETE FROM item_history WHERE user_id = $1', [u.id]);
      await db.query('DELETE FROM items WHERE user_id = $1', [u.id]);
      await db.query('DELETE FROM collections WHERE user_id = $1', [u.id]);
      await db.query('DELETE FROM vault_entries WHERE user_id = $1', [u.id]);
      await db.query('DELETE FROM users WHERE id = $1', [u.id]);
    });
    clearSession(req, res);
    res.json({ ok: true });
  }));

  router.post('/auth/upgrade', requireSession, ah(async (req, res) => {
    if (req.user.auth_version !== 1) throw new HttpError(409, 'This vault has already been upgraded.');
    const { password, authHash, kdf, wrappedVaultKey, collections, items } = req.body || {};
    if (typeof password !== 'string' || !password) throw new HttpError(400, 'password is required.');
    if (!isNonEmptyString(authHash)) throw new HttpError(400, 'authHash is required.');
    if (!isKdf(kdf)) throw new HttpError(400, 'kdf must be {salt: base64 of 16 bytes, params: {...}}.');
    if (!isNonEmptyString(wrappedVaultKey)) throw new HttpError(400, 'wrappedVaultKey is required.');
    const collErr = checkCollections(collections);
    if (collErr) throw new HttpError(400, collErr);
    if (!Array.isArray(items)) throw new HttpError(400, 'items must be an array.');

    const collectionIds = new Set(collections.map((c) => c.id.toLowerCase()));
    const itemIds = new Set();
    for (const it of items) {
      const err = checkItem(it, { withTimestamps: true });
      if (err) throw new HttpError(400, err);
      if (!collectionIds.has(it.collectionId.toLowerCase())) {
        throw new HttpError(400, 'Every item must belong to one of the collections in this upgrade.');
      }
      if (itemIds.has(it.id.toLowerCase())) throw new HttpError(409, 'Two items share the same id.');
      itemIds.add(it.id.toLowerCase());
      if (!Number.isInteger(it.legacyEntryId)) {
        throw new HttpError(400, 'Every item must carry the legacyEntryId of the v1 entry it came from.');
      }
    }

    const newHash = await bcrypt.hash(authHash, bcryptCost);

    const user = await withTx(pool, async (db) => {
      const locked = await db.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const u = locked.rows[0];
      if (!u) throw new HttpError(401, 'Your session has expired. Sign in again.');
      if (u.auth_version !== 1) throw new HttpError(409, 'This vault has already been upgraded.');
      if (!(await bcrypt.compare(password, u.password_hash))) {
        throw new HttpError(400, 'That master password is wrong. Enter the password you sign in with.');
      }

      // The upgrade must account for every v1 entry exactly once, and nothing else.
      const entries = await db.query('SELECT id FROM vault_entries WHERE user_id = $1', [u.id]);
      const expected = new Set(entries.rows.map((r) => r.id));
      const sent = items.map((it) => it.legacyEntryId);
      const sentSet = new Set(sent);
      const exact = sent.length === sentSet.size
        && sentSet.size === expected.size
        && sent.every((id) => expected.has(id));
      if (!exact) {
        throw new HttpError(400, `The upgrade must include exactly one item for each of your ${expected.size} existing entries. Reload and try again.`);
      }

      try {
        await insertCollections(db, u.id, collections);
        for (const it of items) await insertItem(db, u.id, it, { legacyEntryId: it.legacyEntryId });
      } catch (err) {
        if (isUniqueViolation(err)) throw new HttpError(409, 'An item or collection with that id already exists.');
        throw err;
      }

      const updated = await db.query(
        `UPDATE users SET auth_hash = $1, kdf_salt = $2, kdf_params = $3, wrapped_vault_key = $4,
                auth_version = 2, upgraded_at = now()
         WHERE id = $5 RETURNING *`,
        [newHash, kdf.salt, JSON.stringify(kdf.params), wrappedVaultKey, u.id],
      );
      return updated.rows[0];
    });

    await setSession(req, res, user);
    res.json({ ...toSession(user), migrated: items.length });
  }));

  router.post('/auth/change-password', requireSession, requireV2, ah(async (req, res) => {
    const { currentAuthHash, newAuthHash, kdf, wrappedVaultKey } = req.body || {};
    if (!isNonEmptyString(currentAuthHash) || !isNonEmptyString(newAuthHash)) {
      throw new HttpError(400, 'currentAuthHash and newAuthHash are required.');
    }
    if (!isKdf(kdf)) throw new HttpError(400, 'kdf must be {salt: base64 of 16 bytes, params: {...}}.');
    if (!isNonEmptyString(wrappedVaultKey)) throw new HttpError(400, 'wrappedVaultKey is required.');

    const newHash = await bcrypt.hash(newAuthHash, bcryptCost);
    await withTx(pool, async (db) => {
      const r = await db.query('SELECT auth_hash FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const current = r.rows[0];
      if (!current || !current.auth_hash || !(await bcrypt.compare(currentAuthHash, current.auth_hash))) {
        throw new HttpError(400, 'The current master password is wrong. Enter it again.');
      }
      await db.query(
        `UPDATE users SET auth_hash = $1, kdf_salt = $2, kdf_params = $3, wrapped_vault_key = $4 WHERE id = $5`,
        [newHash, kdf.salt, JSON.stringify(kdf.params), wrappedVaultKey, req.user.id],
      );
    });
    res.json({ ok: true });
  }));

  // Same rows as v1: the most recent login attempts on this server.
  router.get('/auth/login-logs', requireSession, ah(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const r = await pool.query(
      'SELECT id, username, ip_address, success, user_agent, created_at FROM login_logs ORDER BY created_at DESC, id DESC LIMIT $1',
      [limit],
    );
    res.json(r.rows.map(toLoginLog));
  }));

  router.get('/legacy/entries', requireSession, ah(async (req, res) => {
    const r = await pool.query(
      'SELECT * FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
      [req.user.id],
    );
    res.json(r.rows.map(toLegacyEntry));
  }));

  return router;
};

module.exports = { createAuthRouter };
