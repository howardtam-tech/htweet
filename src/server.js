// ============================================================================
//  server.js — builds the Express app, wires in sessions + routes, serves the
//  frontend, and starts listening. This is the file `npm start` runs.
// ----------------------------------------------------------------------------
//  Read it top-to-bottom; the ORDER of app.use(...) calls matters in Express —
//  each request flows through them in the order they're registered.
// ============================================================================

const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const pool = require('./db');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');

const app = express();

// Read configuration from the environment, with safe local defaults.
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-insecure-secret';
const isProduction = process.env.NODE_ENV === 'production';

// On Render (and most hosts) our app sits BEHIND a proxy that terminates HTTPS.
// "trust proxy" lets Express know the original request was secure, which is
// required for secure cookies to work correctly in production.
if (isProduction) {
  app.set('trust proxy', 1);
}


// --- 1) Parse JSON request bodies -------------------------------------------
// Lets us read req.body on POST/PUT requests that send JSON.
// The limit is raised from the 100kb default because a profile photo can be
// sent as an embedded "data URL" (the image encoded as text). The frontend
// shrinks photos before upload, so this ceiling is just comfortable headroom.
app.use(express.json({ limit: '2mb' }));


// --- 2) Sessions (the login system) -----------------------------------------
// This middleware reads the session cookie on each request and makes
// req.session available. Sessions are stored in Postgres (the "session" table)
// via connect-pg-simple, so logins survive server restarts.
app.use(
  session({
    store: new PgSession({
      pool,                 // reuse our shared database pool
      tableName: 'session', // matches the table created in schema.sql
    }),
    secret: SESSION_SECRET, // signs the cookie so it can't be tampered with
    resave: false,          // don't re-save unchanged sessions
    saveUninitialized: false, // don't create empty sessions for anonymous visitors
    cookie: {
      httpOnly: true,       // JavaScript in the browser can't read the cookie (safer)
      sameSite: 'lax',      // basic protection against cross-site request forgery
      secure: isProduction, // only send over HTTPS in production
      maxAge: 1000 * 60 * 60 * 24 * 7, // stay logged in for 7 days
    },
  })
);


// --- 3) API routes ----------------------------------------------------------
// Each group of routes is mounted under a base path.
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);

// If a request starts with /api but matched none of the routes above, it's a
// genuine "no such endpoint" — answer with JSON 404 (not the HTML page below).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});


// --- 4) Serve the frontend (static files) -----------------------------------
// Everything in /public (index.html, style.css, app.js) is served as-is.
// Because the API and the frontend come from the SAME server, the browser
// sends our session cookie automatically — no CORS setup needed.
app.use(express.static(path.join(__dirname, '..', 'public')));


// --- 5) Central error handler -----------------------------------------------
// Any route that calls next(err) ends up here. We log the real error for
// ourselves but send the user a generic message (don't leak internals).
// (Express recognizes this as an error handler because it takes 4 arguments.)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});


// --- 6) Start listening ------------------------------------------------------
app.listen(PORT, () => {
  console.log(`HtweetH is running at http://localhost:${PORT}`);
});
