// Session cookie (HS256 JWT in an httpOnly cookie) and auth middleware.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'wv_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

const createSessionKit = (pool) => {
  let secretPromise = null;

  // The secret is created by migrate(); reading it lazily keeps createApp() synchronous.
  const getSecret = () => {
    if (!secretPromise) {
      secretPromise = (async () => {
        await pool.query(
          `INSERT INTO server_settings (key, value) VALUES ('jwt_secret', $1)
           ON CONFLICT (key) DO NOTHING`,
          [crypto.randomBytes(48).toString('base64')],
        );
        const r = await pool.query(`SELECT value FROM server_settings WHERE key = 'jwt_secret'`);
        return r.rows[0].value;
      })().catch((err) => {
        secretPromise = null;
        throw err;
      });
    }
    return secretPromise;
  };

  const cookieOptions = (req) => ({
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: req.secure,
  });

  const setSession = async (req, res, user) => {
    const token = jwt.sign({ uid: user.id, v: user.auth_version }, await getSecret(), {
      algorithm: 'HS256',
      expiresIn: '12h',
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_MS });
  };

  const clearSession = (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions(req));
  };

  // Loads the signed-in user into req.user. The token's auth version must match the
  // account's current one (a v1 cookie issued before an upgrade is no longer valid).
  const requireSession = async (req, res, next) => {
    try {
      const token = req.cookies && req.cookies[COOKIE_NAME];
      if (!token) return res.status(401).json({ error: 'You are signed out. Sign in to continue.' });
      let payload;
      try {
        payload = jwt.verify(token, await getSecret(), { algorithms: ['HS256'] });
      } catch {
        clearSession(req, res);
        return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
      }
      const r = await pool.query('SELECT * FROM users WHERE id = $1', [payload.uid]);
      const user = r.rows[0];
      if (!user || user.auth_version !== payload.v) {
        clearSession(req, res);
        return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };

  const requireV2 = (req, res, next) => {
    if (req.user.auth_version !== 2) {
      return res.status(409).json({ error: 'Upgrade your vault first.' });
    }
    next();
  };

  return { getSecret, setSession, clearSession, requireSession, requireV2 };
};

module.exports = { createSessionKit, COOKIE_NAME };
