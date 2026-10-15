// Boots the WreckVault API: migrate (with the cold-boot retry loop), then listen.
require('dotenv').config({ quiet: true });
const { pool, initDb } = require('./db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 5000;

const main = async () => {
  await initDb(pool);
  createApp(pool).listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
