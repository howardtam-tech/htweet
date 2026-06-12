-- ============================================================================
--  HtweetH — database schema
-- ----------------------------------------------------------------------------
--  Run this file ONCE against your database to create all the tables.
--  Locally:   psql "$DATABASE_URL" -f schema.sql
--  On Render: paste the contents into the database's "Query" / psql shell once.
--
--  Read this file top-to-bottom — the tables are ordered by dependency:
--  a table that POINTS AT another table (a "foreign key") must be created
--  AFTER the table it points at, or Postgres won't know what it's referring to.
-- ============================================================================


-- Running this file again should be safe during development, so we drop the
-- old tables first. We drop in REVERSE dependency order (children before
-- parents) and use CASCADE so dependent rows/constraints go too.
-- NOTE: this deletes all data. That's fine while developing; do NOT run the
-- DROP lines against a database you care about.
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
-- (the "session" table is managed by the login library — see the bottom of this file)


-- ----------------------------------------------------------------------------
--  users — one row per account
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    -- SERIAL = an auto-incrementing integer. Postgres fills it in for us, so
    -- every user gets a unique id (1, 2, 3, …) without us doing anything.
    id            SERIAL PRIMARY KEY,

    -- UNIQUE means the database itself refuses two accounts with the same name.
    -- This is our safety net even if the application code has a bug.
    username      VARCHAR(30) UNIQUE NOT NULL,

    -- We NEVER store the raw password. We store a bcrypt "hash" — a scrambled,
    -- one-way version of it. Even someone who steals the database can't read
    -- the real passwords. The hash is a fixed-ish length string, so 255 is plenty.
    password_hash VARCHAR(255) NOT NULL,

    -- A short "about me" line shown on the profile page. Optional, so we allow
    -- NULL (no bio yet). 160 characters matches Twitter's bio limit; the server
    -- (routes/users.js) checks this too for a friendly error message.
    bio           VARCHAR(160),

    -- The user's profile photo. We store it as TEXT (no length limit) because it
    -- can hold EITHER a normal image link (https://…/me.jpg) OR a "data URL"
    -- (data:image/jpeg;base64,…) — a whole small image encoded as text. Storing
    -- the picture this way keeps the project to one database with no separate
    -- file storage to set up. Optional, so NULL = "use the letter fallback".
    avatar_url    TEXT,

    -- When the account was made. DEFAULT NOW() means Postgres stamps the
    -- current time automatically on insert.
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
--  posts — one row per tweet
-- ----------------------------------------------------------------------------
CREATE TABLE posts (
    id         SERIAL PRIMARY KEY,

    -- This links a tweet to the user who wrote it ("foreign key").
    -- REFERENCES users(id) means: this value must match a real users.id.
    -- ON DELETE CASCADE means: if a user is deleted, their tweets go too,
    -- so we never end up with tweets pointing at a user who no longer exists.
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The tweet text. We allow up to 280 characters. We ALSO check the length
    -- in the server code (see routes/posts.js) so users get a friendly error
    -- message — but this column limit is the final backstop in the database.
    content    VARCHAR(280) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
--  likes — one row each time a user likes a post
-- ----------------------------------------------------------------------------
CREATE TABLE likes (
    id      SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

    -- The KEY rule for likes: a given user can like a given post only ONCE.
    -- This UNIQUE constraint on the PAIR (user_id, post_id) makes a double-like
    -- impossible at the database level. Our "like" route leans on this so we
    -- don't have to check-then-insert (which could race). See routes/posts.js.
    UNIQUE (user_id, post_id)
);

-- An index to make "count the likes for this post" and "did THIS user like it?"
-- fast. (Indexes are just lookup shortcuts; not required for correctness.)
CREATE INDEX idx_likes_post_id ON likes (post_id);


-- ----------------------------------------------------------------------------
--  session — used by the login system (express-session + connect-pg-simple)
-- ----------------------------------------------------------------------------
--  When a user logs in, the server keeps a little "session" for them and stores
--  it HERE in the database. Storing sessions in Postgres (instead of in the
--  server's memory) means logins survive a server restart — important on
--  Render, which restarts your app often.
--
--  This exact table definition comes from the connect-pg-simple library:
--  https://github.com/voxpelli/node-connect-pg-simple
--  We create it ourselves so everything lives in one schema file.
CREATE TABLE IF NOT EXISTS "session" (
    "sid"    VARCHAR NOT NULL COLLATE "default",
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session"
    ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
