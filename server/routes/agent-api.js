// The agent API, mounted at /api/agent/v1 (docs/V2-SPEC.md §8.3). Bearer auth only: no
// cookie session and no CSRF header. Everything is scoped to the agent's user AND to the
// collections granted to the agent.
const express = require('express');
const { ah, HttpError, isUniqueViolation } = require('../lib/http');
const { isUuid, isSealed, isPlainObject } = require('../lib/validate');
const { toItem, toAgentItem } = require('../lib/rows');
const { createAgentAuth } = require('../lib/agent-auth');
const {
  checkItem, insertItem, updateItem, ITEM_NOT_FOUND,
} = require('./vault');

const READ_ONLY = 'This device has read-only access. Reconnect it with "Read and write" to make changes.';
const NOT_GRANTED = 'This device has no access to that collection.';

const createAgentApiRouter = ({ pool }) => {
  const router = express.Router();
  const { failedAuthLimiter, requireAgent } = createAgentAuth(pool);
  router.use(failedAuthLimiter, requireAgent);

  // Granted collections of the agent's own user, as a Set of lower-case ids.
  const grantedIds = async (db, agent) => {
    const r = await db.query(
      `SELECT g.collection_id FROM agent_grants g JOIN collections c ON c.id = g.collection_id
        WHERE g.agent_id = $1 AND c.user_id = $2`,
      [agent.id, agent.user_id],
    );
    return new Set(r.rows.map((row) => String(row.collection_id).toLowerCase()));
  };
  const has = (set, id) => set.has(String(id).toLowerCase());

  const requireWrite = (req, res, next) => {
    if (!req.agent.can_write) return res.status(403).json({ error: READ_ONLY });
    next();
  };

  const requireIdParam = (req, res, next) => {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'The item id must be a UUID v4.' });
    next();
  };

  router.get('/me', ah(async (req, res) => {
    const a = req.agent;
    const r = await pool.query(
      `SELECT c.id, c.name, c.kind, g.wrapped_key
         FROM agent_grants g JOIN collections c ON c.id = g.collection_id
        WHERE g.agent_id = $1 AND c.user_id = $2
        ORDER BY c.sort, c.created_at`,
      [a.id, a.user_id],
    );
    res.json({
      agent: { id: a.id, name: a.name, canWrite: a.can_write },
      collections: r.rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, wrappedKey: c.wrapped_key })),
    });
  }));

  router.get('/items', ah(async (req, res) => {
    const r = await pool.query(
      `SELECT i.* FROM items i
         JOIN agent_grants g ON g.collection_id = i.collection_id AND g.agent_id = $1
        WHERE i.user_id = $2 AND i.deleted_at IS NULL
        ORDER BY i.created_at, i.id`,
      [req.agent.id, req.agent.user_id],
    );
    res.json(r.rows.map(toAgentItem));
  }));

  router.post('/items', requireWrite, ah(async (req, res) => {
    const it = req.body || {};
    const err = checkItem(it);
    if (err) throw new HttpError(400, err);
    if (!has(await grantedIds(pool, req.agent), it.collectionId)) throw new HttpError(403, NOT_GRANTED);
    try {
      const row = await insertItem(pool, req.agent.user_id, { ...it, createdAt: null, updatedAt: null });
      res.json(toItem(row));
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'An item with that id already exists.');
      throw e;
    }
  }));

  router.put('/items/:id', requireWrite, requireIdParam, ah(async (req, res) => {
    const it = req.body || {};
    const err = checkItem(it, { withId: false });
    if (err) throw new HttpError(400, err);
    const row = await updateItem(pool, req.agent.user_id, req.params.id, it, async (db, old) => {
      // The agent never sees trashed items, so it can't edit them either.
      if (old.deleted_at) throw new HttpError(404, ITEM_NOT_FOUND);
      const granted = await grantedIds(db, req.agent);
      if (!has(granted, old.collection_id) || !has(granted, it.collectionId)) {
        throw new HttpError(403, NOT_GRANTED);
      }
    });
    res.json(toItem(row));
  }));

  // Logs a read. Allowed for read-only devices; a trashed item still accepts the log so
  // reads queued offline are not lost.
  router.post('/items/:id/reads', requireIdParam, ah(async (req, res) => {
    const b = req.body;
    if (!isPlainObject(b) || !isUuid(b.id)) throw new HttpError(400, 'The read id must be a UUID v4.');
    if (!isSealed(b.encrypted)) throw new HttpError(400, 'encrypted must be a sealed blob.');
    const item = await pool.query(
      `SELECT i.id FROM items i
         JOIN agent_grants g ON g.collection_id = i.collection_id AND g.agent_id = $1
        WHERE i.id = $2 AND i.user_id = $3`,
      [req.agent.id, req.params.id, req.agent.user_id],
    );
    if (!item.rows[0]) throw new HttpError(404, ITEM_NOT_FOUND);
    try {
      await pool.query(
        'INSERT INTO item_reads (id, item_id, user_id, agent_id, encrypted) VALUES ($1, $2, $3, $4, $5)',
        [b.id, req.params.id, req.agent.user_id, req.agent.id, b.encrypted],
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'A read with that id already exists.');
      throw e;
    }
    res.json({ ok: true });
  }));

  router.use((req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}.` });
  });

  return router;
};

module.exports = { createAgentApiRouter };
