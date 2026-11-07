// Entry point: connect to the database, build it on first run, start HTTP.
const config = require('./config/env');
const db = require('./config/db');
const { ensureDatabase } = require('./config/setup');
const { createApp } = require('./app');

async function main() {
  try {
    await db.connect();
  } catch (err) {
    console.error(`[db] Could not connect to the database: ${err.message}`);
    if (config.databaseUrl) {
      console.error('[db] Check DATABASE_URL in backend/.env and that PostgreSQL is running,');
      console.error('[db] or remove DATABASE_URL to use the embedded database instead.');
    }
    process.exit(1);
  }
  console.log(`[db] connected (${db.kind()}${db.kind() === 'pglite' ? `: ${config.pgliteDataDir}` : ''})`);
  try {
    if (await ensureDatabase()) console.log('[db] new database created and seeded');
  } catch (err) {
    console.error(`[db] Database setup failed: ${err.message}`);
    if (err.code !== 'DB_DAMAGED') console.error('[db] If this keeps happening, stop the server and run "npm run db:reset".');
    process.exit(1);
  }

  const server = createApp().listen(config.port, () => {
    console.log(`NutriCart SmartPantry running at http://localhost:${config.port}`);
  });
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `[http] Port ${config.port} is already in use. Set PORT in backend/.env.` : err);
    process.exit(1);
  });

  const shutdown = async () => {
    server.close();
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
