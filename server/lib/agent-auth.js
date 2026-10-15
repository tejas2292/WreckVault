// Bearer auth for the agent API (docs/V2-SPEC.md §8.3). Never looks at cookies.
// Header: `Authorization: Bearer wva1.<agentId>.<agentToken>`; the server stores only
// hex SHA-256(agentToken) in agents.token_hash.
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { isUuid, isBase64Url32 } = require('./validate');

const LAST_USED_EVERY_MS = 60 * 1000;
const UNAUTHORIZED = 'This device is not connected. Run `wv login` with a new connection string.';

const hashToken = (token) => crypto.createHash('sha256').update(token, 'utf8').digest('hex');

// Compared against when the agent id is unknown, so timing doesn't reveal which ids exist.
const DUMMY_HASH = hashToken(crypto.randomBytes(32).toString('base64url'));

const tokenMatches = (token, storedHex) => {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(typeof storedHex === 'string' ? storedHex : '', 'hex');
  if (b.length !== a.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

// Returns {agentId, token} or null.
const parseBearer = (header) => {
  if (typeof header !== 'string') return null;
  const m = /^Bearer (\S+)$/.exec(header.trim());
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3 || parts[0] !== 'wva1') return null;
  const [, agentId, token] = parts;
  if (!isUuid(agentId) || !isBase64Url32(token)) return null;
  return { agentId, token };
};

const createAgentAuth = (pool) => {
  // 20 failed (401) agent auths per IP per 15 minutes. Other errors from an authenticated
  // agent (403, 404, 400) are not auth failures and don't count.
  const failedAuthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    message: { error: 'Too many failed device sign-ins. Please try again in 15 minutes.' },
  });

  // Loads req.agent (the agents row) and req.agentUser ({id, auth_version}).
  const requireAgent = async (req, res, next) => {
    try {
      const parsed = parseBearer(req.get('Authorization'));
      if (!parsed) return res.status(401).json({ error: UNAUTHORIZED });
      const r = await pool.query(
        `SELECT a.*, u.auth_version FROM agents a JOIN users u ON u.id = a.user_id WHERE a.id = $1`,
        [parsed.agentId],
      );
      const agent = r.rows[0];
      const ok = tokenMatches(parsed.token, agent ? agent.token_hash : DUMMY_HASH);
      if (!agent || !ok || agent.revoked_at || agent.auth_version !== 2) {
        return res.status(401).json({ error: UNAUTHORIZED });
      }
      const last = agent.last_used_at ? new Date(agent.last_used_at).getTime() : 0;
      if (Date.now() - last >= LAST_USED_EVERY_MS) {
        // The WHERE clause keeps concurrent requests to one write a minute.
        await pool.query(
          `UPDATE agents SET last_used_at = now()
           WHERE id = $1 AND (last_used_at IS NULL OR last_used_at <= now() - interval '1 minute')`,
          [agent.id],
        );
      }
      req.agent = agent;
      next();
    } catch (err) {
      next(err);
    }
  };

  return { failedAuthLimiter, requireAgent };
};

module.exports = { createAgentAuth, hashToken, parseBearer };
