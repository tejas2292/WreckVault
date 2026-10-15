// Web routes for connected devices (docs/V2-SPEC.md §8.3): /api/agents and
// /api/items/:id/reads. Cookie session, v2 only, CSRF header like every other web route.
const express = require('express');
const { ah, HttpError, withTx, isUniqueViolation } = require('../lib/http');
const {
  isUuid, isNonEmptyString, isPlainObject, isSealed, isBase64Url32,
} = require('../lib/validate');
const { toAgent, toItemRead } = require('../lib/rows');
const { hashToken } = require('../lib/agent-auth');
const { ITEM_NOT_FOUND } = require('./vault');

const AGENT_NOT_FOUND = 'Device not found. It may belong to another account.';

// Agent rows with their granted collection ids.
const AGENT_SELECT = `
  SELECT a.*, COALESCE(
           (SELECT array_agg(g.collection_id ORDER BY c.sort, c.created_at)
              FROM agent_grants g JOIN collections c ON c.id = g.collection_id
             WHERE g.agent_id = a.id),
           '{}') AS collection_ids
    FROM agents a`;

// Returns an error sentence for a bad POST /agents body, or null.
const checkAgentBody = (b) => {
  if (!isPlainObject(b)) return 'Send the device as a JSON object.';
  if (!isUuid(b.id)) return 'The device id must be a UUID v4.';
  if (typeof b.name !== 'string' || b.name.trim().length === 0 || b.name.length > 60) {
    return 'Give the device a name of 1 to 60 characters.';
  }
  if (b.canWrite !== undefined && typeof b.canWrite !== 'boolean') return 'canWrite must be true or false.';
  if (!isBase64Url32(b.token)) return 'token must be the base64url encoding of 32 bytes.';
  if (!Array.isArray(b.grants) || b.grants.length === 0) return 'Grant the device at least one collection.';
  const seen = new Set();
  for (const g of b.grants) {
    if (!isPlainObject(g)) return 'Each grant must be an object.';
    if (!isUuid(g.collectionId)) return 'Each grant needs a collectionId that is a UUID v4.';
    if (seen.has(g.collectionId.toLowerCase())) return 'Each collection can be granted only once.';
    seen.add(g.collectionId.toLowerCase());
    if (!isSealed(g.wrappedKey)) return 'Each grant needs a wrappedKey sealed for the device.';
  }
  return null;
};

const createAgentsRouter = ({ pool, session }) => {
  const router = express.Router();
  const guard = [session.requireSession, session.requireV2];

  const loadAgent = async (db, userId, id) => {
    const r = await db.query(`${AGENT_SELECT} WHERE a.id = $1 AND a.user_id = $2`, [id, userId]);
    return r.rows[0];
  };

  router.get('/agents', guard, ah(async (req, res) => {
    const r = await pool.query(
      `${AGENT_SELECT} WHERE a.user_id = $1 ORDER BY a.created_at DESC, a.id`,
      [req.user.id],
    );
    res.json(r.rows.map(toAgent));
  }));

  router.post('/agents', guard, ah(async (req, res) => {
    const b = req.body;
    const err = checkAgentBody(b);
    if (err) throw new HttpError(400, err);

    const row = await withTx(pool, async (db) => {
      const ids = b.grants.map((g) => g.collectionId);
      const owned = await db.query(
        'SELECT count(*)::int AS n FROM collections WHERE user_id = $1 AND id = ANY($2::uuid[])',
        [req.user.id, ids],
      );
      if (owned.rows[0].n !== ids.length) {
        throw new HttpError(400, 'That collection does not exist in your vault.');
      }
      try {
        await db.query(
          `INSERT INTO agents (id, user_id, name, token_hash, can_write) VALUES ($1, $2, $3, $4, $5)`,
          [b.id, req.user.id, b.name.trim(), hashToken(b.token), b.canWrite === true],
        );
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, 'A device with that id already exists.');
        throw e;
      }
      for (const g of b.grants) {
        await db.query(
          'INSERT INTO agent_grants (agent_id, collection_id, wrapped_key) VALUES ($1, $2, $3)',
          [b.id, g.collectionId, g.wrappedKey],
        );
      }
      return loadAgent(db, req.user.id, b.id);
    });
    res.json(toAgent(row));
  }));

  router.delete('/agents/:id', guard, ah(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, 'The device id must be a UUID v4.');
    const r = await pool.query(
      `UPDATE agents SET revoked_at = COALESCE(revoked_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id],
    );
    if (!r.rows[0]) throw new HttpError(404, AGENT_NOT_FOUND);
    res.json(toAgent(await loadAgent(pool, req.user.id, req.params.id)));
  }));

  router.get('/items/:id/reads', guard, ah(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, 'The item id must be a UUID v4.');
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const own = await pool.query('SELECT 1 FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!own.rows[0]) throw new HttpError(404, ITEM_NOT_FOUND);
    const r = await pool.query(
      `SELECT r.*, a.name AS agent_name
         FROM item_reads r LEFT JOIN agents a ON a.id = r.agent_id
        WHERE r.item_id = $1 AND r.user_id = $2
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $3`,
      [req.params.id, req.user.id, limit],
    );
    res.json(r.rows.map(toItemRead));
  }));

  return router;
};

module.exports = { createAgentsRouter, checkAgentBody };
