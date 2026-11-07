// Database access layer.
// The rest of the backend only uses query(), exec() and transaction(), so it
// does not care whether it is talking to a PostgreSQL server (node-postgres)
// or to the embedded PostgreSQL engine (PGlite). Both speak the same SQL.
const fs = require('fs');
const config = require('./env');

// Type OIDs we normalise so both drivers return the same JS types.
const OID = { INT8: 20, NUMERIC: 1700, DATE: 1082 };
const parsers = {
  [OID.INT8]: (v) => (v === null ? null : parseInt(v, 10)),
  [OID.NUMERIC]: (v) => (v === null ? null : parseFloat(v)),
  [OID.DATE]: (v) => v, // keep DATE as 'YYYY-MM-DD' to avoid timezone shifts
};

let driver = null; // { kind, query(text, params), exec(sql), transaction(fn), close() }

async function connectPg() {
  const { Pool, types } = require('pg');
  for (const [oid, fn] of Object.entries(parsers)) types.setTypeParser(Number(oid), fn);
  const pool = new Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  await pool.query('SELECT 1'); // fail fast if the server is unreachable
  return {
    kind: 'postgresql',
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    exec: async (sql) => { await pool.query(sql); },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: async (t, p = []) => (await client.query(t, p)).rows });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function connectPglite() {
  const { PGlite } = require('@electric-sql/pglite');
  const dataDir = config.pgliteDataDir;
  if (!dataDir.startsWith('memory://')) fs.mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir, { parsers });
  await db.waitReady;
  // PGlite is a single connection, so transactions must be serialised.
  let chain = Promise.resolve();
  const serial = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    kind: 'pglite',
    query: (text, params = []) => serial(async () => (await db.query(text, params)).rows),
    exec: (sql) => serial(() => db.exec(sql)),
    transaction: (fn) => serial(() => db.transaction((tx) =>
      fn({ query: async (t, p = []) => (await tx.query(t, p)).rows }))),
    close: () => db.close(),
  };
}

async function connect() {
  if (driver) return driver;
  driver = config.databaseUrl ? await connectPg() : await connectPglite();
  return driver;
}

function get() {
  if (!driver) {
    const err = new Error('Database is not connected');
    err.code = 'DB_NOT_CONNECTED';
    throw err;
  }
  return driver;
}

module.exports = {
  connect,
  query: (text, params) => get().query(text, params),
  exec: (sql) => get().exec(sql),
  transaction: (fn) => get().transaction(fn),
  kind: () => (driver ? driver.kind : null),
  close: async () => { if (driver) { await driver.close(); driver = null; } },
};
