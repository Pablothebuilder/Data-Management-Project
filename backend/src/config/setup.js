// Creates (or recreates) the database from the SQL files in /database.
// Order: schema.sql -> extensions.sql -> views.sql -> seeders/seed.sql
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATABASE_DIR } = require('./env');

const SQL_FILES = ['schema.sql', 'extensions.sql', 'views.sql', path.join('seeders', 'seed.sql')];

function readSql(file) {
  return fs.readFileSync(path.join(DATABASE_DIR, file), 'utf8');
}

async function isInitialised() {
  const rows = await db.query("SELECT to_regclass('public.users') IS NOT NULL AS ready");
  return rows[0].ready;
}

async function applyAll({ log = console.log } = {}) {
  for (const file of SQL_FILES) {
    log(`[db] applying ${file}`);
    await db.exec(readSql(file));
  }
}

// The public schema must be usable (exist and be on the search_path). A damaged
// embedded database can list "public" in pg_namespace but fail to resolve it.
async function assertSchemaUsable() {
  const [row] = await db.query("SELECT 'public' = ANY (current_schemas(false)) AS ok");
  if (!row.ok) {
    const err = new Error('The database files are damaged (the "public" schema cannot be found). '
      + 'Stop the server and run "npm run db:reset" in the backend folder to rebuild it.');
    err.code = 'DB_DAMAGED';
    throw err;
  }
}

// Called on server start: builds the database the first time only.
// Views are re-applied on every start so edits to views.sql take effect.
async function ensureDatabase({ log = console.log } = {}) {
  await assertSchemaUsable();
  if (await isInitialised()) {
    await db.exec(readSql('extensions.sql'));
    await db.exec(readSql('views.sql'));
    return false;
  }
  await applyAll({ log });
  return true;
}

// PostgreSQL server only: drops everything and rebuilds (npm run db:reset).
// The embedded database is reset by deleting its folder instead (see scripts/db-reset.js).
async function resetDatabase({ log = console.log } = {}) {
  log('[db] dropping schema public');
  await db.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await applyAll({ log });
}

module.exports = { ensureDatabase, resetDatabase, applyAll };
