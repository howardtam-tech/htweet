// ============================================================================
//  db.js — our single shared connection to Postgres
// ----------------------------------------------------------------------------
//  A "Pool" keeps a small set of open database connections ready to reuse.
//  Opening a brand-new connection for every request would be slow, so we open
//  the pool ONCE here and every route imports this same pool.
//
//  Golden rule for the whole project: we only ever run PARAMETERIZED queries,
//  i.e. pool.query('... WHERE id = $1', [id]). We never glue user input
//  directly into the SQL string. That single habit is what makes us immune to
//  SQL injection, so we teach it as the default — see any route file.
// ============================================================================

const { Pool } = require('pg');

// Where is the database? Prefer the DATABASE_URL environment variable (Render
// provides this for you). Fall back to a sensible local default so the app can
// run on your laptop with zero configuration.
const connectionString =
  process.env.DATABASE_URL || 'postgres://localhost:5432/htweeth';

// Render's managed Postgres requires an encrypted (SSL) connection, but your
// local Postgres almost certainly does NOT. We turn SSL on only when we're
// clearly talking to a remote host. A local URL contains "localhost" or
// "127.0.0.1"; anything else we treat as remote and enable SSL.
const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  // rejectUnauthorized:false accepts Render's certificate without extra setup.
  // That's fine for a class project; a production app would verify the cert.
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// If a connection in the pool ever errors out in the background, log it loudly
// instead of letting the whole process crash silently.
pool.on('error', (err) => {
  console.error('Unexpected error on an idle database connection:', err);
});

// Export the pool so every route file shares this exact same one.
module.exports = pool;
