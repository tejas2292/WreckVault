// Small HTTP/DB helpers.

// Wraps an async route so rejected promises reach the error handler (Express 4).
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// An error the error handler turns into {error} with the given status.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Runs fn(client) inside BEGIN/COMMIT; rolls back on any throw.
const withTx = async (pool, fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
};

// Postgres unique_violation.
const isUniqueViolation = (err) => err && err.code === '23505';

// Best-effort client IP. `trust proxy` is set, so req.ip already honours X-Forwarded-For
// from trusted proxies; strip the ::ffff: prefix Node adds for IPv4 connections.
const clientIp = (req) => String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');

module.exports = { ah, HttpError, withTx, isUniqueViolation, clientIp };
