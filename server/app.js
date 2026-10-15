// Builds the Express app around a pg Pool. index.js boots it; tests mount it with supertest.
const express = require('express');
const cookieParser = require('cookie-parser');
const { createSessionKit } = require('./lib/session');
const { createAuthRouter } = require('./routes/auth');
const { createVaultRouter } = require('./routes/vault');
const { createAgentsRouter } = require('./routes/agents');
const { createAgentApiRouter } = require('./routes/agent-api');

const createApp = (pool, { bcryptCost = 12 } = {}) => {
  const app = express();
  app.disable('x-powered-by');
  // nginx (and an optional tunnel in front of it) sit on loopback / private addresses.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());

  // Agent API (docs/V2-SPEC.md §8.3): bearer token only, mounted before the CSRF check and
  // the cookie routes. Its router ends in its own 404, so nothing under this prefix falls
  // through to a cookie-session route.
  app.use('/api/agent/v1', createAgentApiRouter({ pool }));

  // CSRF: the app is same-origin and every state-changing request carries this header,
  // which a cross-site form or simple request cannot set.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-WV-Client') !== '1') return res.status(403).json({ error: 'Missing client header' });
    next();
  });

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: true });
    } catch {
      res.status(503).json({ ok: false, db: false });
    }
  });

  const session = createSessionKit(pool);
  app.use('/api', createAuthRouter({ pool, session, bcryptCost }));
  app.use('/api', createVaultRouter({ pool, session }));
  app.use('/api', createAgentsRouter({ pool, session }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}.` });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'That request is too large. Keep attachments under 1 MB each.' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body is not valid JSON.' });
    }
    if (err.expose && err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment.' });
  });

  return app;
};

module.exports = { createApp };
