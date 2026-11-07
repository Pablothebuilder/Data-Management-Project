// npm run db:reset - deletes and rebuilds the database from /database/*.sql.
//
// Embedded database (PGlite): the data folder is deleted and created again.
// We deliberately do NOT use "DROP SCHEMA public" there: PGlite can leave its
// on-disk catalog inconsistent after dropping and re-creating the public schema,
// and the next start then fails with "no schema has been selected to create in".
// PostgreSQL server (DATABASE_URL): the public schema is dropped and re-created.
const fs = require('fs');
const config = require('../src/config/env');
const db = require('../src/config/db');
const { applyAll, resetDatabase } = require('../src/config/setup');

(async () => {
  try {
    const embedded = !config.databaseUrl;
    if (embedded && !config.pgliteDataDir.startsWith('memory://')) {
      console.log(`[db] deleting embedded database folder ${config.pgliteDataDir}`);
      fs.rmSync(config.pgliteDataDir, { recursive: true, force: true });
    }
    await db.connect();
    console.log(`[db] connected (${db.kind()})`);
    if (embedded) await applyAll();
    else await resetDatabase();
    await db.close();
    console.log('[db] reset complete');
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.error('[db] reset failed: the database files are in use. Stop the running server (Ctrl+C) and try again.');
    } else {
      console.error('[db] reset failed:', err.message);
    }
    process.exit(1);
  }
})();
