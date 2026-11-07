// Central place for configuration read from environment variables / backend/.env.
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const ROOT_DIR = path.join(__dirname, '..', '..', '..');

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  // A random secret still works locally; sessions simply do not survive a restart.
  sessionSecret = crypto.randomBytes(32).toString('hex');
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[config] SESSION_SECRET not set - using a random secret for this run.');
  }
}

module.exports = {
  ROOT_DIR,
  DATABASE_DIR: path.join(ROOT_DIR, 'database'),
  FRONTEND_DIR: path.join(ROOT_DIR, 'frontend'),
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret,
  // When DATABASE_URL is set we connect to a PostgreSQL server with node-postgres.
  // Otherwise an embedded PostgreSQL (PGlite) stores its files in pgliteDataDir.
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDataDir: process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', '..', '.data', 'pglite'),
  offUserAgent: process.env.OFF_USER_AGENT || 'NutriCartSmartPantry/1.0 (SOFE3700 student project)',
  externalTimeoutMs: Number(process.env.EXTERNAL_TIMEOUT_MS) || 10000,
};
