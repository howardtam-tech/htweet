# HtweetH — a minimal Twitter clone

A small, readable Twitter clone built for a class project. The goal is
**clarity and learnability**, not cleverness — the code is heavily commented to
explain *why*, not just *what*.

- **Frontend:** plain HTML/CSS + **React loaded from a CDN** (no build step).
- **Backend:** Node.js + Express.
- **Database:** PostgreSQL.
- **Auth:** username + password (hashed with bcrypt) and server-side sessions
  stored in Postgres.

The whole app runs from a **single Express server** that serves both the API and
the frontend.

---

## Features

- Sign up, log in, log out (passwords are hashed; sessions persist across restarts).
- Post a tweet (text, must be non-empty and ≤ 280 characters).
- A feed of all tweets, newest first, showing the author and like count.
- Like / unlike any tweet.
- User profiles (click a username to see just their tweets).
- You can only delete your **own** tweets.

---

## Project structure

```
htweet/
├── public/                 # the frontend (served as static files)
│   ├── index.html          # loads React via CDN + app.js
│   ├── style.css           # hand-written CSS, no framework
│   └── app.js              # the whole React app (fake data first, then live API)
├── src/
│   ├── server.js           # Express app: sessions, routes, static files, start
│   ├── db.js               # one shared Postgres connection pool
│   ├── middleware/
│   │   └── requireLogin.js # blocks logged-out users from write actions
│   └── routes/
│       ├── auth.js         # signup / login / logout / me
│       ├── posts.js        # feed, create, delete, like, unlike
│       └── users.js        # profile by username
├── schema.sql              # all table definitions (run once)
├── .env.example            # template for environment variables
├── package.json            # dependencies + "start" script
└── README.md
```

---

## API reference

| Method & path                 | What it does                                   | Auth |
| ----------------------------- | ---------------------------------------------- | ---- |
| `POST   /api/auth/signup`     | Create an account and log in (201)             | —    |
| `POST   /api/auth/login`      | Log in (200) / wrong creds (401)               | —    |
| `POST   /api/auth/logout`     | Log out (204)                                  | —    |
| `GET    /api/auth/me`         | The current user, or `{ user: null }`          | —    |
| `GET    /api/posts`           | Feed, newest first (username + like_count)     | —    |
| `POST   /api/posts`           | Create a tweet (201) / bad input (400)         | ✅   |
| `DELETE /api/posts/:id`       | Delete your own tweet (204) / not found (404)  | ✅   |
| `POST   /api/posts/:id/like`  | Like a tweet (201)                             | ✅   |
| `DELETE /api/posts/:id/like`  | Unlike a tweet (204)                           | ✅   |
| `GET    /api/users/:username` | A user's profile + their tweets (404 if none)  | —    |

All write routes return **401** if you're not logged in.

---

## Run it locally

You need **Node.js 18+** and **PostgreSQL** installed and running.

### 1. Install dependencies

```bash
cd htweet
npm install
```

### 2. Create the database

```bash
# Create an empty database named "htweeth"
createdb htweeth
```

> On some setups you may need `createdb -U postgres htweeth` or to run `psql`
> first. Any empty Postgres database works — just match its name in DATABASE_URL.

### 3. Load the schema (creates the tables — run this ONCE)

```bash
psql "postgres://localhost:5432/htweeth" -f schema.sql
```

### 4. Set up environment variables

```bash
cp .env.example .env
```

Then open `.env` and, at minimum, set a real `SESSION_SECRET`. You can generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> The app also has sensible local defaults, so it will start even without a
> `.env` file — but setting `SESSION_SECRET` is good practice.

### 5. Start the server

```bash
npm start
```

Open **http://localhost:3000** in your browser. Sign up, post a tweet, like it. 🎉

---

## The "fake data → live data" teaching switch

Open `public/app.js`. The very top of the file has one line:

```js
const USE_FAKE_DATA = false;
```

- Set it to **`true`** and reload: the app runs entirely on a **hardcoded array
  of fake tweets** with **no backend** — great for showing the UI in isolation.
- Set it back to **`false`**: the same app now talks to the **live Express +
  Postgres server** through the clearly-labeled **API LAYER** (section ④ of
  `app.js`).

Flipping this single value in front of students shows the exact moment fake data
is replaced by real server data — the components never change, only the API layer.

---

## Deploy to Render

[Render](https://render.com) can host both the web service and the database for
free-tier class use. Do these steps in order.

### 1. Push your code to GitHub

Render deploys from a Git repository, so commit and push this project to a GitHub
repo first.

### 2. Create the Postgres database

1. In the Render dashboard: **New → Postgres**.
2. Give it a name and **pick a region** (note which one — e.g. *Oregon*).
3. Create it, then open it and copy the **Internal Database URL**.

### 3. Create the web service

1. **New → Web Service**, and connect your GitHub repo.
2. **Use the SAME region** you picked for the database. (Same region = the app
   and database can talk over Render's fast internal network, and the internal
   URL works.)
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add **Environment Variables**:
   - `DATABASE_URL` → paste the **Internal Database URL** from step 2.
   - `SESSION_SECRET` → a long random string (generate one as shown above).
   - `NODE_ENV` → `production` (enables secure login cookies).
   - You do **not** need to set `PORT` — Render provides it automatically.
5. Click **Create Web Service** and wait for the first deploy to finish.

### 4. Load the schema on Render (run ONCE)

The database starts empty, so create the tables once:

- **Option A — psql from your laptop:** copy the database's **External
  Connection** URL from Render and run:
  ```bash
  psql "<EXTERNAL_DATABASE_URL_FROM_RENDER>" -f schema.sql
  ```
- **Option B — Render's shell:** open the database in the dashboard and paste the
  contents of `schema.sql` into its query/psql console.

### 5. Open your app

Visit the web service's URL (e.g. `https://htweeth.onrender.com`). Sign up and
post — you're live.

> **Note:** on Render's free tier the service sleeps when idle, so the first
> request after a while may take a few seconds to wake up.

---

## How it stays safe (things worth pointing out to students)

- **No SQL injection:** every query is *parameterized* (`$1`, `$2`) — user input
  is never glued into SQL strings. See any file in `src/routes/`.
- **Passwords are never stored in plain text:** they're hashed with bcrypt
  (`src/routes/auth.js`).
- **Login is enforced on the server**, not just hidden in the UI — the
  `requireLogin` middleware guards every write route, and you can only delete
  your own tweets.
```
