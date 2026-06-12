// ============================================================================
//  routes/auth.js — sign up, log in, log out, and "who am I?"
// ----------------------------------------------------------------------------
//  These routes are mounted under /api/auth in server.js, so:
//      router.post('/signup')  ->  POST /api/auth/signup
//
//  Passwords: we hash them with bcrypt before storing, and we compare hashes
//  on login. We never store or compare the raw password.
// ============================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

// How "strong" the password hashing is. Higher = slower = harder to crack.
// 10 is a common, sensible default.
const BCRYPT_ROUNDS = 10;

// A small helper so we never accidentally send the password_hash to the browser.
// Given a full user row, return only the safe public fields. (bio and avatar_url
// are public profile info, so they're safe to include.)
function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    bio: row.bio || null,
    avatar_url: row.avatar_url || null,
    created_at: row.created_at,
  };
}


// ----------------------------------------------------------------------------
//  POST /api/auth/signup  — create a new account and log them in
// ----------------------------------------------------------------------------
router.post('/signup', async (req, res, next) => {
  try {
    // Pull the fields out of the JSON body. They might be missing, so we guard.
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    // --- validation (give friendly 400 errors for bad input) ---
    if (username.length < 3 || username.length > 30) {
      return res
        .status(400)
        .json({ error: 'Username must be between 3 and 30 characters.' });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters.' });
    }

    // Scramble the password into a hash we can safely store.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Parameterized insert ($1, $2) — never string-concatenated.
    // RETURNING gives us back the row we just created (including the new id).
    const result = await pool.query(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, bio, avatar_url, created_at`,
      [username, passwordHash]
    );

    const user = result.rows[0];

    // Log them in immediately by saving their id on the session.
    req.session.userId = user.id;

    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    // Postgres error code 23505 = "unique_violation". Because username is
    // UNIQUE in the schema, this fires when the name is already taken.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    next(err); // anything else -> the central error handler in server.js
  }
});


// ----------------------------------------------------------------------------
//  POST /api/auth/login  — check credentials and start a session
// ----------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required.' });
    }

    // Look the user up by name.
    const result = await pool.query(
      'SELECT id, username, password_hash, bio, avatar_url, created_at FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];

    // SECURITY NOTE: whether the username doesn't exist OR the password is
    // wrong, we return the exact same 401 message. That way an attacker can't
    // tell which usernames are real.
    const passwordOk =
      user && (await bcrypt.compare(password, user.password_hash));

    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Good credentials — start the session.
    req.session.userId = user.id;

    return res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  POST /api/auth/logout  — end the session
// ----------------------------------------------------------------------------
router.post('/logout', (req, res, next) => {
  // Destroy wipes the session row from the database.
  req.session.destroy((err) => {
    if (err) return next(err);
    // Also clear the browser's session cookie. 'connect.sid' is the default
    // cookie name used by express-session.
    res.clearCookie('connect.sid');
    return res.status(204).end(); // 204 No Content = "done, nothing to send back"
  });
});


// ----------------------------------------------------------------------------
//  GET /api/auth/me  — who is logged in right now? (used by the frontend on load)
// ----------------------------------------------------------------------------
router.get('/me', async (req, res, next) => {
  try {
    // Not logged in? That's not an error — just report "nobody".
    if (!req.session.userId) {
      return res.json({ user: null });
    }

    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );

    // Edge case: the session points at a user that no longer exists (e.g. the
    // account was deleted). Treat that as logged out.
    if (result.rows.length === 0) {
      return res.json({ user: null });
    }

    return res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
