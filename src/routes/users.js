// ============================================================================
//  routes/users.js — public user profiles
// ----------------------------------------------------------------------------
//  Mounted under /api/users in server.js, so:
//      router.get('/:username')  ->  GET /api/users/:username
//
//  A profile is just "this user + the tweets they've written". Viewing a
//  profile is public, so no login is required here.
// ============================================================================

const express = require('express');
const pool = require('../db');
const requireLogin = require('../middleware/requireLogin');

const router = express.Router();

// Profile limits. The bio limit matches the VARCHAR(160) column in schema.sql.
// The avatar limit is a safety cap so nobody can store an enormous string in the
// database (a downscaled photo from the frontend is only tens of kilobytes).
const MAX_BIO_LENGTH = 160;
const MAX_AVATAR_LENGTH = 1_000_000; // ~1 MB of text


// ----------------------------------------------------------------------------
//  PUT /api/users/me — update YOUR OWN profile (bio + avatar). Login required.
// ----------------------------------------------------------------------------
//  NOTE: this is declared BEFORE the "/:username" route below. Express matches
//  routes in order, but these never actually collide (this is PUT, the other is
//  GET). We keep "me" first anyway as a clear convention.
//
//  A user can only ever edit their own profile: we write to the row identified
//  by req.session.userId, never an id from the request body. So there's nothing
//  to "authorize" beyond being logged in.
// ----------------------------------------------------------------------------
router.put('/me', requireLogin, async (req, res, next) => {
  try {
    // Normalize the inputs. We trim the bio, and treat empty string as "clear
    // it" (NULL). avatar_url is either a link, a data: URL, or empty to remove.
    const bioRaw = (req.body.bio || '').trim();
    const avatarRaw = (req.body.avatar_url || '').trim();

    // --- validation (friendly 400s for bad input) ---
    if (bioRaw.length > MAX_BIO_LENGTH) {
      return res
        .status(400)
        .json({ error: `Bio can be at most ${MAX_BIO_LENGTH} characters.` });
    }
    if (avatarRaw.length > MAX_AVATAR_LENGTH) {
      return res
        .status(400)
        .json({ error: 'That image is too large. Please use a smaller photo.' });
    }
    // If an avatar was provided, it must look like a web link or an embedded
    // image (data URL). This blocks pasting something that isn't an image.
    if (
      avatarRaw &&
      !/^https?:\/\//i.test(avatarRaw) &&
      !/^data:image\//i.test(avatarRaw)
    ) {
      return res.status(400).json({
        error: 'Avatar must be an image URL (http/https) or an uploaded image.',
      });
    }

    // Empty string -> store NULL so "no bio" / "no avatar" is consistent.
    const bio = bioRaw || null;
    const avatarUrl = avatarRaw || null;

    const result = await pool.query(
      `UPDATE users
          SET bio = $1, avatar_url = $2
        WHERE id = $3
      RETURNING id, username, bio, avatar_url, created_at`,
      [bio, avatarUrl, req.session.userId]
    );

    return res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  GET /api/users/:username — one user's profile and their tweets
// ----------------------------------------------------------------------------
router.get('/:username', async (req, res, next) => {
  try {
    const username = req.params.username;
    // If logged in, we again compute liked_by_me so the heart shows correctly
    // on the profile page too. 0 means "no real viewer".
    const viewerId = req.session.userId || 0;

    // First, find the user.
    const userResult = await pool.query(
      'SELECT id, username, bio, avatar_url, created_at FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const user = userResult.rows[0];

    // Then, fetch that user's tweets — same shape as the main feed so the
    // frontend can reuse its Tweet component without changes.
    const postsResult = await pool.query(
      `SELECT
         posts.id,
         posts.content,
         posts.created_at,
         users.id   AS user_id,
         users.username,
         users.avatar_url,
         COUNT(likes.id)::int AS like_count,
         EXISTS (
           SELECT 1 FROM likes
           WHERE likes.post_id = posts.id AND likes.user_id = $1
         ) AS liked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id
       LEFT JOIN likes ON likes.post_id = posts.id
       WHERE posts.user_id = $2          -- only THIS user's tweets
       GROUP BY posts.id, users.id, users.username, users.avatar_url
       ORDER BY posts.created_at DESC`,
      [viewerId, user.id]
    );

    return res.json({ user, posts: postsResult.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
