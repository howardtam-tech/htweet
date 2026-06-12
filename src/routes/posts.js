// ============================================================================
//  routes/posts.js — the heart of the app: the feed, posting, deleting, liking
// ----------------------------------------------------------------------------
//  Mounted under /api/posts in server.js, so:
//      router.get('/')          ->  GET    /api/posts
//      router.post('/:id/like') ->  POST   /api/posts/:id/like
//
//  Reading the feed is public. Writing (post / delete / like) requires login,
//  enforced by the requireLogin middleware.
// ============================================================================

const express = require('express');
const pool = require('../db');
const requireLogin = require('../middleware/requireLogin');

const router = express.Router();

// The single source of truth for the tweet length limit. Used in validation
// below; also enforced by the VARCHAR(280) column in schema.sql as a backstop.
const MAX_TWEET_LENGTH = 280;


// ----------------------------------------------------------------------------
//  GET /api/posts — the feed: every tweet, newest first
// ----------------------------------------------------------------------------
//  Each row includes the author's username and a like_count. If the requester
//  is logged in, we also include liked_by_me so the UI can show a filled vs
//  empty heart. This is the ONE query that powers the whole timeline.
// ----------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    // If nobody is logged in, use 0 — no real user has id 0, so liked_by_me
    // will simply be false for everyone.
    const viewerId = req.session.userId || 0;

    const result = await pool.query(
      `SELECT
         posts.id,
         posts.content,
         posts.created_at,
         users.id   AS user_id,
         users.username,
         users.avatar_url,                              -- the author's photo (or NULL)
         -- COUNT how many likes rows join to this post. ::int converts the
         -- count from a big-number type to a plain integer for clean JSON.
         COUNT(likes.id)::int AS like_count,
         -- Did the current viewer like this post? EXISTS returns true/false.
         EXISTS (
           SELECT 1 FROM likes
           WHERE likes.post_id = posts.id AND likes.user_id = $1
         ) AS liked_by_me
       FROM posts
       JOIN users ON users.id = posts.user_id          -- attach the author
       LEFT JOIN likes ON likes.post_id = posts.id      -- attach likes (0 or more)
       GROUP BY posts.id, users.id, users.username, users.avatar_url
       ORDER BY posts.created_at DESC`, // GROUP BY = one row per post; ORDER BY = newest first
      [viewerId]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  POST /api/posts — create a new tweet (login required)
// ----------------------------------------------------------------------------
router.post('/', requireLogin, async (req, res, next) => {
  try {
    // Pull the text out and trim surrounding whitespace so "   " counts as empty.
    const content = (req.body.content || '').trim();

    // Validate: must be non-empty AND within the length limit.
    if (content.length === 0) {
      return res.status(400).json({ error: 'A tweet cannot be empty.' });
    }
    if (content.length > MAX_TWEET_LENGTH) {
      return res
        .status(400)
        .json({ error: `A tweet can be at most ${MAX_TWEET_LENGTH} characters.` });
    }

    // Insert it, attributed to the logged-in user (from the session, NOT from
    // the request body — the client can't pretend to be someone else).
    const insert = await pool.query(
      `INSERT INTO posts (user_id, content)
       VALUES ($1, $2)
       RETURNING id, content, created_at, user_id`,
      [req.session.userId, content]
    );

    // Re-shape the response to match what the feed returns, so the frontend can
    // drop the new tweet straight into the list. A brand-new tweet has 0 likes.
    const post = insert.rows[0];
    const me = await pool.query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [post.user_id]
    );

    return res.status(201).json({
      id: post.id,
      content: post.content,
      created_at: post.created_at,
      user_id: post.user_id,
      username: me.rows[0].username,
      avatar_url: me.rows[0].avatar_url,
      like_count: 0,
      liked_by_me: false,
    });
  } catch (err) {
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  DELETE /api/posts/:id — delete a tweet (login required, must be your own)
// ----------------------------------------------------------------------------
router.delete('/:id', requireLogin, async (req, res, next) => {
  try {
    // :id arrives as text from the URL; turn it into a number.
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Delete ONLY if this post exists AND belongs to the logged-in user.
    // Combining both checks into the WHERE clause means a user can never delete
    // someone else's tweet. RETURNING id tells us whether a row actually matched.
    const result = await pool.query(
      'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id',
      [postId, req.session.userId]
    );

    // No row matched -> either the post doesn't exist, or it isn't theirs.
    // We answer 404 for both so we don't reveal that someone else's post exists.
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tweet not found.' });
    }

    return res.status(204).end(); // 204 No Content = deleted, nothing to return
  } catch (err) {
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  POST /api/posts/:id/like — like a tweet (login required)
// ----------------------------------------------------------------------------
router.post('/:id/like', requireLogin, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Insert a like. The UNIQUE(user_id, post_id) constraint from schema.sql
    // guarantees one like per user per post; ON CONFLICT DO NOTHING makes a
    // repeat "like" a harmless no-op instead of an error. So liking is
    // "idempotent" — clicking twice has the same effect as clicking once.
    await pool.query(
      `INSERT INTO likes (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      [req.session.userId, postId]
    );

    return res.status(201).json({ liked: true });
  } catch (err) {
    // Postgres error 23503 = "foreign_key_violation": the post_id doesn't point
    // at a real post, i.e. the tweet doesn't exist.
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Tweet not found.' });
    }
    next(err);
  }
});


// ----------------------------------------------------------------------------
//  DELETE /api/posts/:id/like — unlike a tweet (login required)
// ----------------------------------------------------------------------------
router.delete('/:id/like', requireLogin, async (req, res, next) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ error: 'Invalid post id.' });
    }

    // Remove this user's like for this post. If there was no like, this simply
    // deletes nothing — also harmless/idempotent, so we always answer success.
    await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [
      req.session.userId,
      postId,
    ]);

    return res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
