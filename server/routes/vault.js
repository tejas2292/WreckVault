// /api/collections and /api/items routes (v2 sessions only). Every query is scoped by user_id.
const express = require('express');
const { ah, HttpError, withTx, isUniqueViolation } = require('../lib/http');
const {
  ITEM_TYPES, isUuid, isNonEmptyString, isPlainObject, isItemType, checkCollections,
} = require('../lib/validate');
const { toCollection, toItem, toHistory } = require('../lib/rows');

const isTimestamp = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

// Returns an error sentence for a bad item body, or null.
const checkItem = (it, { withId = true, withTimestamps = false } = {}) => {
  if (!isPlainObject(it)) return 'Each item must be an object.';
  if (withId && !isUuid(it.id)) return 'Each item needs a UUID v4 id.';
  if (!isUuid(it.collectionId)) return 'collectionId must be a UUID v4.';
  if (!isItemType(it.type)) return `type must be one of: ${ITEM_TYPES.join(', ')}.`;
  if (!isNonEmptyString(it.encrypted)) return 'encrypted is required.';
  if (withTimestamps) {
    if (it.createdAt != null && !isTimestamp(it.createdAt)) return 'createdAt must be an ISO timestamp.';
    if (it.updatedAt != null && !isTimestamp(it.updatedAt)) return 'updatedAt must be an ISO timestamp.';
  }
  return null;
};

const insertCollections = async (db, userId, collections) => {
  let sort = 0;
  for (const c of collections) {
    await db.query(
      `INSERT INTO collections (id, user_id, name, kind, agent_access, wrapped_key, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [c.id, userId, c.name, c.kind, c.agentAccess === true, c.wrappedKey, sort],
    );
    sort += 1;
  }
};

const insertItem = async (db, userId, it, { legacyEntryId = null } = {}) => {
  const r = await db.query(
    `INSERT INTO items (id, user_id, collection_id, type, encrypted, legacy_entry_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), COALESCE($8::timestamptz, now()))
     RETURNING *`,
    [it.id, userId, it.collectionId, it.type, it.encrypted, legacyEntryId, it.createdAt || null, it.updatedAt || null],
  );
  return r.rows[0];
};

const ITEM_NOT_FOUND = 'Item not found. It may have been deleted.';

// The one item update path (web and agent API): in a transaction, lock the user's item,
// let `authorize(db, oldRow)` veto the change by throwing, copy the current version into
// item_history, then apply {collectionId, type, encrypted}. Returns the updated row.
const updateItem = (pool, userId, itemId, it, authorize) => withTx(pool, async (db) => {
  const cur = await db.query(
    'SELECT * FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [itemId, userId],
  );
  const old = cur.rows[0];
  if (!old) throw new HttpError(404, ITEM_NOT_FOUND);
  if (authorize) await authorize(db, old);
  await db.query(
    `INSERT INTO item_history (item_id, user_id, collection_id, type, encrypted, version_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [old.id, old.user_id, old.collection_id, old.type, old.encrypted, old.updated_at],
  );
  const r = await db.query(
    `UPDATE items SET collection_id = $1, type = $2, encrypted = $3, updated_at = now()
     WHERE id = $4 AND user_id = $5 RETURNING *`,
    [it.collectionId, it.type, it.encrypted, old.id, userId],
  );
  return r.rows[0];
});

const createVaultRouter = ({ pool, session }) => {
  const router = express.Router();
  const guard = [session.requireSession, session.requireV2];

  const ownsCollection = async (db, userId, collectionId) => {
    const r = await db.query('SELECT 1 FROM collections WHERE id = $1 AND user_id = $2', [collectionId, userId]);
    return r.rows.length > 0;
  };

  const requireIdParam = (req, res, next) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'The item id must be a UUID v4.' });
    next();
  };

  const NOT_FOUND = ITEM_NOT_FOUND;

  router.get('/collections', guard, ah(async (req, res) => {
    const r = await pool.query(
      'SELECT * FROM collections WHERE user_id = $1 ORDER BY sort, created_at',
      [req.user.id],
    );
    res.json(r.rows.map(toCollection));
  }));

  router.post('/collections', guard, ah(async (req, res) => {
    const body = { kind: 'custom', agentAccess: false, ...(req.body || {}) };
    const err = checkCollections([body], { allowedKinds: ['custom'] });
    if (err) throw new HttpError(400, err);
    try {
      const r = await pool.query(
        `INSERT INTO collections (id, user_id, name, kind, agent_access, wrapped_key, sort)
         VALUES ($1, $2, $3, $4, $5, $6,
                 (SELECT COALESCE(MAX(sort) + 1, 0) FROM collections WHERE user_id = $2))
         RETURNING *`,
        [body.id, req.user.id, body.name, body.kind, body.agentAccess, body.wrappedKey],
      );
      res.json(toCollection(r.rows[0]));
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'A collection with that id already exists.');
      throw e;
    }
  }));

  router.get('/items', guard, ah(async (req, res) => {
    const r = await pool.query(
      'SELECT * FROM items WHERE user_id = $1 ORDER BY created_at, id',
      [req.user.id],
    );
    res.json(r.rows.map(toItem));
  }));

  router.post('/items', guard, ah(async (req, res) => {
    const it = req.body || {};
    const err = checkItem(it);
    if (err) throw new HttpError(400, err);
    if (!(await ownsCollection(pool, req.user.id, it.collectionId))) {
      throw new HttpError(400, 'That collection does not exist in your vault.');
    }
    try {
      const row = await insertItem(pool, req.user.id, { ...it, createdAt: null, updatedAt: null });
      res.json(toItem(row));
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'An item with that id already exists.');
      throw e;
    }
  }));

  router.put('/items/:id', guard, requireIdParam, ah(async (req, res) => {
    const it = req.body || {};
    const err = checkItem(it, { withId: false });
    if (err) throw new HttpError(400, err);

    const row = await updateItem(pool, req.user.id, req.params.id, it, async (db) => {
      if (!(await ownsCollection(db, req.user.id, it.collectionId))) {
        throw new HttpError(400, 'That collection does not exist in your vault.');
      }
    });
    res.json(toItem(row));
  }));

  router.delete('/items/:id', guard, requireIdParam, ah(async (req, res) => {
    const r = await pool.query(
      `UPDATE items SET deleted_at = COALESCE(deleted_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (!r.rows[0]) throw new HttpError(404, NOT_FOUND);
    res.json(toItem(r.rows[0]));
  }));

  router.post('/items/:id/restore', guard, requireIdParam, ah(async (req, res) => {
    const r = await pool.query(
      'UPDATE items SET deleted_at = NULL WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id],
    );
    if (!r.rows[0]) throw new HttpError(404, NOT_FOUND);
    res.json(toItem(r.rows[0]));
  }));

  router.delete('/items/:id/permanent', guard, requireIdParam, ah(async (req, res) => {
    await withTx(pool, async (db) => {
      const cur = await db.query(
        'SELECT deleted_at FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.id, req.user.id],
      );
      if (!cur.rows[0]) throw new HttpError(404, NOT_FOUND);
      if (!cur.rows[0].deleted_at) {
        throw new HttpError(409, 'Move the item to the trash before deleting it permanently.');
      }
      await db.query('DELETE FROM item_history WHERE item_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
      await db.query('DELETE FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    });
    res.json({ ok: true });
  }));

  router.get('/items/:id/history', guard, requireIdParam, ah(async (req, res) => {
    const own = await pool.query('SELECT 1 FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!own.rows[0]) throw new HttpError(404, NOT_FOUND);
    const r = await pool.query(
      `SELECT * FROM item_history WHERE item_id = $1 AND user_id = $2
       ORDER BY replaced_at DESC, id DESC`,
      [req.params.id, req.user.id],
    );
    res.json(r.rows.map(toHistory));
  }));

  return router;
};

module.exports = {
  createVaultRouter, checkItem, insertCollections, insertItem, updateItem, ITEM_NOT_FOUND,
};
