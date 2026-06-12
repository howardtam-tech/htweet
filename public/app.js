// ============================================================================
//  app.js — the entire HtweetH frontend, written in React (loaded via CDN).
// ----------------------------------------------------------------------------
//  HOW TO READ THIS FILE (top to bottom):
//    ①  FAKE DATA + the USE_FAKE_DATA switch   <-- the teaching moment
//    ②  Small helpers (time formatting)
//    ③  React components (what the user sees)
//    ④  THE API LAYER (where fake data becomes real fetch() calls)
//    ⑤  Start the app
// ============================================================================


// ============================================================================
//  ①  FAKE DATA  — the app runs with NO backend while this is turned on.
// ----------------------------------------------------------------------------
//  THE most important line for the lesson is right here:
//
//      USE_FAKE_DATA = true   ->  the app uses the hardcoded array below.
//                                 No server, no database needed. Open the page
//                                 with a plain file server and it just works.
//
//      USE_FAKE_DATA = false  ->  the app talks to the real Express + Postgres
//                                 backend through the API LAYER (section ④).
//
//  Flip this single value in front of your students to show the EXACT moment
//  fake data is replaced by live server data. Everything else stays identical —
//  only the API LAYER (section ④) changes its behavior based on this flag.
// ============================================================================
const USE_FAKE_DATA = false;

// A pretend "logged in" user, so the compose box works in demo mode.
// (bio + avatar_url mirror the real user shape so the profile page works too.)
const FAKE_CURRENT_USER = {
  id: 1,
  username: "ada",
  bio: "Counting on it. Demo-mode human.",
  avatar_url: null,
  created_at: "2026-01-01",
};

// A hardcoded timeline. Each object has the SAME shape the real API returns,
// so our components don't care whether data is fake or real.
const FAKE_TWEETS = [
  {
    id: 3,
    username: "grace",
    user_id: 2,
    avatar_url: null,
    content: "Just shipped my first Express route. It returned JSON and I cheered. 🎉",
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    like_count: 4,
    liked_by_me: false,
  },
  {
    id: 2,
    username: "ada",
    user_id: 1,
    avatar_url: null,
    content: "Reminder: parameterized queries ($1, $2) keep SQL injection out by default.",
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hr ago
    like_count: 12,
    liked_by_me: true,
  },
  {
    id: 1,
    username: "linus",
    user_id: 3,
    avatar_url: null,
    content: "Hello, world. This is my first tweet on HtweetH.",
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), // ~1 day ago
    like_count: 7,
    liked_by_me: false,
  },
];

// A mutable in-memory copy used ONLY in demo mode, so liking/posting/deleting
// visibly work without a backend. (In live mode this is ignored entirely.)
let fakeStore = FAKE_TWEETS.map((t) => ({ ...t }));


// ============================================================================
//  ②  HELPERS
// ============================================================================

// Turn an ISO timestamp into a short "3m", "2h", "5d" label like real Twitter.
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Pull React's hooks into local names so we can write useState instead of
// React.useState everywhere below.
const { useState, useEffect } = React;

// Read an image file the user picked and return a small "data URL" (the image
// encoded as a text string we can store in the database). We SHRINK it first by
// drawing it onto a canvas at most `maxSize` pixels wide/tall — a phone photo is
// huge, but a profile picture only needs to be tiny. This keeps the saved string
// to tens of kilobytes instead of megabytes. Returns a Promise.
function shrinkImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a valid image."));
      img.onload = () => {
        // Scale down so the LONGEST side is maxSize; never scale up (cap at 1).
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // JPEG at 85% quality is a good size/quality tradeoff for a photo.
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result; // the file's bytes as a data URL
    };
    reader.readAsDataURL(file);
  });
}


// ============================================================================
//  ③  REACT COMPONENTS
// ============================================================================

// --- A profile photo (or a letter fallback) ---------------------------------
//  Works for anything that has { username, avatar_url } — a user OR a tweet.
//  If there's a photo we show it; otherwise we show the first letter of the
//  username on a colored circle. `size` is the diameter in pixels.
function Avatar({ user, size = 44, onClick }) {
  const url = user && user.avatar_url;
  const letter = (user && user.username ? user.username[0] : "?").toUpperCase();
  return (
    <div
      className={"avatar" + (onClick ? " clickable" : "")}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      onClick={onClick}
      title={user ? "@" + user.username : ""}
    >
      {url ? <img src={url} alt="" /> : <span>{letter}</span>}
    </div>
  );
}

// --- A single tweet ---------------------------------------------------------
function Tweet({ tweet, currentUser, onToggleLike, onDelete, onViewProfile }) {
  // You can only delete your OWN tweets. We compare ids to decide whether to
  // show the delete button. (The server enforces this too — never trust the UI alone.)
  const isMine = currentUser && currentUser.id === tweet.user_id;

  return (
    <div className="card tweet">
      <Avatar
        user={tweet}
        size={44}
        onClick={() => onViewProfile(tweet.username)}
      />

      <div className="tweet-body">
        <div className="tweet-head">
          <span className="username" onClick={() => onViewProfile(tweet.username)}>
            @{tweet.username}
          </span>
          <span className="time">· {timeAgo(tweet.created_at)}</span>
        </div>

        <div className="content">{tweet.content}</div>

        <div className="tweet-actions">
        {/* The like button toggles between liked/unliked. The filled heart and
            color come from the "liked" CSS class. */}
        <button
          className={"like-btn" + (tweet.liked_by_me ? " liked" : "")}
          onClick={() => onToggleLike(tweet)}
          // In demo mode there's always a fake user; in live mode you must be
          // logged in to like, so we disable the button when logged out.
          disabled={!currentUser}
          title={currentUser ? "" : "Log in to like"}
        >
          {tweet.liked_by_me ? "♥" : "♡"} {tweet.like_count}
        </button>

          {isMine && (
            <button className="delete-btn" onClick={() => onDelete(tweet)}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- The compose box (write a new tweet) ------------------------------------
function ComposeBox({ onPost }) {
  const [text, setText] = useState("");
  const MAX = 280; // keep in sync with the server's limit

  const remaining = MAX - text.length;
  const isEmpty = text.trim().length === 0;
  const isOver = text.length > MAX;

  function handlePost() {
    if (isEmpty || isOver) return; // guard; button is also disabled below
    onPost(text.trim());
    setText(""); // clear the box after posting
  }

  return (
    <div className="card compose">
      <textarea
        placeholder="What's happening?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="compose-footer">
        <span className={"char-count" + (isOver ? " over" : "")}>
          {remaining}
        </span>
        <button className="btn" onClick={handlePost} disabled={isEmpty || isOver}>
          Post
        </button>
      </div>
    </div>
  );
}

// --- Login / Sign up forms --------------------------------------------------
function AuthForms({ onAuthSuccess }) {
  // "mode" flips between the login and signup versions of the same form.
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault(); // stop the browser from reloading the page on submit
    setError("");
    try {
      // Call signup or login depending on which form is showing.
      const data =
        mode === "signup"
          ? await api.signup(username, password)
          : await api.login(username, password);
      onAuthSuccess(data.user); // tell App who just logged in
    } catch (err) {
      setError(err.message); // show the server's friendly error message
    }
  }

  return (
    <div className="card auth">
      <h2>{mode === "signup" ? "Create your account" : "Log in"}</h2>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <input
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn" type="submit">
          {mode === "signup" ? "Sign up" : "Log in"}
        </button>
      </form>

      {/* Link to switch between the two modes. */}
      <div className="switch">
        {mode === "signup" ? (
          <span>
            Already have an account?{" "}
            <a onClick={() => { setMode("login"); setError(""); }}>Log in</a>
          </span>
        ) : (
          <span>
            New here?{" "}
            <a onClick={() => { setMode("signup"); setError(""); }}>Sign up</a>
          </span>
        )}
      </div>
    </div>
  );
}

// --- The top bar ------------------------------------------------------------
function Header({
  currentUser,
  onHome,
  onLogout,
  onViewProfile,
  onEditProfile,
  onAppearance,
  theme,
  onToggleTheme,
}) {
  return (
    <div className="header">
      <h1 onClick={onHome}>HtweetH</h1>
      <div className="who">
        {currentUser ? (
          <span className="who-user">
            {/* The little avatar doubles as a link to your own profile. */}
            <Avatar
              user={currentUser}
              size={28}
              onClick={() => onViewProfile(currentUser.username)}
            />
            <a onClick={() => onViewProfile(currentUser.username)}>
              @{currentUser.username}
            </a>{" "}
            · <a onClick={onEditProfile}>Edit profile</a>{" "}
            · <a onClick={onAppearance}>Appearance</a>{" "}
            · <a onClick={onLogout}>Log out</a>
          </span>
        ) : (
          <span>Not logged in</span>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </div>
  );
}

// --- A one-click light/dark switch (a sun or moon button) -------------------
function ThemeToggle({ theme, onToggle }) {
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

// --- The "Appearance" page: dark mode + a custom background image -----------
//  These are personal display preferences, so they live in the browser
//  (localStorage), not the database — they're saved per device, and apply
//  instantly with no server round-trip.
function AppearancePanel({ theme, onSetTheme, bgImage, onSetBg, onClearBg, onDone }) {
  const [error, setError] = useState("");

  // Upload a background photo: shrink it (bigger than an avatar, since it fills
  // the page) and store it as a data URL.
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await shrinkImageToDataUrl(file, 1280);
      onSetBg(dataUrl);
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  }

  const usingUpload = bgImage.startsWith("data:");

  return (
    <div className="card appearance">
      <h2>Appearance</h2>

      {error && <div className="error">{error}</div>}

      {/* --- Light / dark --- */}
      <label className="field-label">Theme</label>
      <div className="theme-choice">
        <button
          className={"btn" + (theme === "light" ? "" : " ghost")}
          onClick={() => onSetTheme("light")}
        >
          ☀️ Light
        </button>
        <button
          className={"btn" + (theme === "dark" ? "" : " ghost")}
          onClick={() => onSetTheme("dark")}
        >
          🌙 Dark
        </button>
      </div>

      {/* --- Background image --- */}
      <label className="field-label">Background image</label>
      <div
        className="bg-preview"
        style={{ backgroundImage: bgImage ? `url("${bgImage}")` : "none" }}
      >
        {!bgImage && <span>No background</span>}
      </div>
      <div className="bg-controls">
        <label className="btn file-btn">
          Choose image
          <input type="file" accept="image/*" onChange={handleFile} hidden />
        </label>
        {bgImage && (
          <a className="remove-link" onClick={onClearBg}>
            Remove background
          </a>
        )}
      </div>

      {/* Or paste a link instead of uploading. */}
      <label className="field-label">Or paste an image URL</label>
      <input
        className="text-input"
        placeholder="https://example.com/photo.jpg"
        value={usingUpload ? "" : bgImage}
        onChange={(e) => onSetBg(e.target.value)}
        disabled={usingUpload}
      />
      {usingUpload && (
        <p className="hint">Using your uploaded image. Remove it to paste a URL.</p>
      )}

      <div className="edit-footer">
        <span />
        <button className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

// --- The "Edit profile" page (add a photo + a bio, then save) ---------------
//  This is its own little screen. It starts from the user's current values, lets
//  them change the photo and bio, and calls onSave to persist them to the server.
function EditProfile({ currentUser, onSave, onCancel }) {
  const [bio, setBio] = useState(currentUser.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const MAX_BIO = 160; // keep in sync with the server + the database column
  const remaining = MAX_BIO - bio.length;
  const isOver = bio.length > MAX_BIO;

  // When the user picks a file, shrink it to a small data URL and preview it.
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    try {
      const dataUrl = await shrinkImageToDataUrl(file, 256);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err.message);
    }
    e.target.value = ""; // let them re-pick the same file later
  }

  async function handleSave() {
    if (isOver) return;
    setError("");
    setSaving(true);
    try {
      await onSave(bio.trim(), avatarUrl.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false); // stay on the page so they can fix it
    }
  }

  // Preview object has the shape Avatar expects: { username, avatar_url }.
  const preview = { username: currentUser.username, avatar_url: avatarUrl };

  return (
    <div className="card edit-profile">
      <h2>Edit profile</h2>

      {error && <div className="error">{error}</div>}

      {/* --- Photo --- */}
      <div className="edit-avatar-row">
        <Avatar user={preview} size={88} />
        <div className="edit-avatar-controls">
          <label className="btn file-btn">
            Choose photo
            <input type="file" accept="image/*" onChange={handleFile} hidden />
          </label>
          {avatarUrl && (
            <a className="remove-link" onClick={() => setAvatarUrl("")}>
              Remove photo
            </a>
          )}
        </div>
      </div>

      {/* You can also paste an image link instead of uploading a file. */}
      <label className="field-label">Photo URL (optional)</label>
      <input
        className="text-input"
        placeholder="https://example.com/me.jpg"
        value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        // When an uploaded photo is in place, the box shows a friendly note
        // instead of a giant data URL.
        disabled={avatarUrl.startsWith("data:")}
      />
      {avatarUrl.startsWith("data:") && (
        <p className="hint">Using your uploaded photo. Remove it to paste a URL.</p>
      )}

      {/* --- Bio --- */}
      <label className="field-label">Bio</label>
      <textarea
        className="bio-input"
        placeholder="Tell people about yourself…"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
      />
      <div className="edit-footer">
        <span className={"char-count" + (isOver ? " over" : "")}>{remaining}</span>
        <div className="edit-buttons">
          <button className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn" onClick={handleSave} disabled={isOver || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- The root component: holds all state and decides what to show -----------
function App() {
  const [currentUser, setCurrentUser] = useState(null); // null = logged out
  const [tweets, setTweets] = useState([]);             // the feed
  const [loading, setLoading] = useState(true);

  // "view" controls which screen we're on:
  //   { name: "feed" }                     -> the main timeline
  //   { name: "profile", username: "ada" } -> one user's profile
  const [view, setView] = useState({ name: "feed" });
  const [profile, setProfile] = useState(null); // { user, posts } when viewing a profile

  // --- Display preferences (saved in the browser, not the database) ----------
  // We READ the saved values straight away so the app starts in the user's
  // chosen theme/background instead of flashing the defaults first.
  const [theme, setTheme] = useState(
    () => localStorage.getItem("htweet-theme") || "light"
  );
  const [bgImage, setBgImage] = useState(
    () => localStorage.getItem("htweet-bg") || ""
  );

  // Apply + remember the theme whenever it changes. We tag the <html> element
  // with data-theme; the dark colors in style.css key off [data-theme="dark"].
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("htweet-theme", theme);
  }, [theme]);

  // Apply + remember the background image whenever it changes.
  useEffect(() => {
    if (bgImage) {
      document.body.style.backgroundImage = `url("${bgImage}")`;
      document.body.classList.add("has-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.classList.remove("has-bg");
    }
    localStorage.setItem("htweet-bg", bgImage);
  }, [bgImage]);

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  // --- On first load: find out who's logged in, and load the feed. ---
  // useEffect with an empty [] dependency list runs ONCE when the app mounts.
  useEffect(() => {
    async function boot() {
      try {
        const me = await api.getMe();
        setCurrentUser(me.user);
        const feed = await api.getFeed();
        setTweets(feed);
      } catch (err) {
        console.error("Failed to load:", err);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  // Reload the feed from scratch (used after posting/deleting).
  async function reloadFeed() {
    const feed = await api.getFeed();
    setTweets(feed);
  }

  // --- Event handlers passed down to the components --------------------------

  async function handlePost(content) {
    const newTweet = await api.createPost(content);
    // Put the new tweet at the top instantly, no full reload needed.
    setTweets((prev) => [newTweet, ...prev]);
  }

  async function handleDelete(tweet) {
    await api.deletePost(tweet.id);
    // Remove it from whichever list we're showing.
    setTweets((prev) => prev.filter((t) => t.id !== tweet.id));
    if (profile) {
      setProfile((p) => ({ ...p, posts: p.posts.filter((t) => t.id !== tweet.id) }));
    }
  }

  // Like and unlike share one handler that flips based on current state.
  async function handleToggleLike(tweet) {
    const nowLiked = !tweet.liked_by_me;
    if (nowLiked) {
      await api.likePost(tweet.id);
    } else {
      await api.unlikePost(tweet.id);
    }
    // Update the count + heart in place, in both the feed and any open profile.
    const apply = (list) =>
      list.map((t) =>
        t.id === tweet.id
          ? {
              ...t,
              liked_by_me: nowLiked,
              like_count: t.like_count + (nowLiked ? 1 : -1),
            }
          : t
      );
    setTweets(apply);
    if (profile) setProfile((p) => ({ ...p, posts: apply(p.posts) }));
  }

  async function handleViewProfile(username) {
    const data = await api.getProfile(username);
    setProfile(data);
    setView({ name: "profile", username });
  }

  // Open the "Edit profile" screen.
  function handleEditProfile() {
    setView({ name: "editProfile" });
  }

  // Open the "Appearance" screen (theme + background).
  function handleAppearance() {
    setView({ name: "appearance" });
  }

  // Save the edited profile, then refresh everything that shows the user so the
  // new photo/bio appear immediately (the header, the feed, and the profile).
  async function handleSaveProfile(bio, avatarUrl) {
    const { user } = await api.updateProfile(bio, avatarUrl);
    setCurrentUser(user);          // header avatar + future "isMine" checks
    await reloadFeed();            // the user's tweets now carry the new photo
    const data = await api.getProfile(user.username); // land on the fresh profile
    setProfile(data);
    setView({ name: "profile", username: user.username });
  }

  function goHome() {
    setView({ name: "feed" });
    setProfile(null);
  }

  async function handleLogout() {
    await api.logout();
    setCurrentUser(null);
    goHome();
    await reloadFeed(); // refresh so hearts reset to logged-out state
  }

  // Someone just logged in or signed up.
  async function handleAuthSuccess(user) {
    setCurrentUser(user);
    await reloadFeed(); // reload so liked_by_me reflects the new user
  }

  // --- What to render --------------------------------------------------------
  if (loading) {
    return (
      <div className="loading-screen">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // --- Logged out: a dedicated, centered login / sign-up page ---------------
  // We show this instead of the normal app shell so the login form is the clear
  // focus, vertically and horizontally centered on the page.
  if (!currentUser) {
    return (
      <div className="auth-screen">
        {/* A floating theme switch so dark mode works before you even log in. */}
        <div className="auth-toggle">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <div className="auth-screen-inner">
          <div className="brand">
            <h1>HtweetH</h1>
            <p className="tagline">See what’s happening. Join the conversation.</p>
          </div>

          <AuthForms onAuthSuccess={handleAuthSuccess} />

          {USE_FAKE_DATA && (
            <div className="banner">
              Demo mode: showing FAKE data (no backend). Set USE_FAKE_DATA =
              false in app.js to use the live server.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        currentUser={currentUser}
        onHome={goHome}
        onLogout={handleLogout}
        onViewProfile={handleViewProfile}
        onEditProfile={handleEditProfile}
        onAppearance={handleAppearance}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* A friendly banner when running on fake data, so it's obvious in class. */}
      {USE_FAKE_DATA && (
        <div className="banner">
          Demo mode: showing FAKE data (no backend). Set USE_FAKE_DATA = false in
          app.js to use the live server.
        </div>
      )}

      {/* The "Edit profile" and "Appearance" screens each take over the page. */}
      {view.name === "editProfile" && currentUser ? (
        <EditProfile
          currentUser={currentUser}
          onSave={handleSaveProfile}
          onCancel={() => handleViewProfile(currentUser.username)}
        />
      ) : view.name === "appearance" ? (
        <AppearancePanel
          theme={theme}
          onSetTheme={setTheme}
          bgImage={bgImage}
          onSetBg={setBgImage}
          onClearBg={() => setBgImage("")}
          onDone={goHome}
        />
      ) : (
        <div>
          {/* We only get here when logged in (logged-out users see the
              centered login page above), so the compose box always shows. */}
          <ComposeBox onPost={handlePost} />

          {/* The main area: either the feed or a profile. */}
          {view.name === "profile" && profile ? (
            <div>
              <div className="card profile-header">
                <Avatar user={profile.user} size={88} />
                <div className="profile-meta">
                  <h2>@{profile.user.username}</h2>
                  {profile.user.bio && (
                    <p className="profile-bio">{profile.user.bio}</p>
                  )}
                  <span className="time">
                    Joined{" "}
                    {new Date(profile.user.created_at).toLocaleDateString()}
                  </span>
                </div>
                {/* Only YOU see an "Edit profile" button on your own page. */}
                {currentUser && currentUser.id === profile.user.id && (
                  <button className="btn" onClick={handleEditProfile}>
                    Edit profile
                  </button>
                )}
              </div>
              {profile.posts.length === 0 ? (
                <p className="empty">No tweets yet.</p>
              ) : (
                profile.posts.map((t) => (
                  <Tweet
                    key={t.id}
                    tweet={t}
                    currentUser={currentUser}
                    onToggleLike={handleToggleLike}
                    onDelete={handleDelete}
                    onViewProfile={handleViewProfile}
                  />
                ))
              )}
            </div>
          ) : (
            <div>
              {tweets.length === 0 ? (
                <p className="empty">No tweets yet. Be the first!</p>
              ) : (
                tweets.map((t) => (
                  <Tweet
                    key={t.id}
                    tweet={t}
                    currentUser={currentUser}
                    onToggleLike={handleToggleLike}
                    onDelete={handleDelete}
                    onViewProfile={handleViewProfile}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
//  ④  THE API LAYER  — where "fake data" becomes "live server data".
// ----------------------------------------------------------------------------
//  EVERY function here checks USE_FAKE_DATA:
//    - if true  -> it returns data from the in-memory fakeStore (no network).
//    - if false -> it calls the real backend with fetch().
//
//  This is the single place that changes between the two stages of the lesson.
//  The components above never change — they just call api.getFeed(), etc.
// ============================================================================

// A small helper: read the JSON body, and if the response was an error status,
// throw an Error carrying the server's message so the UI can display it.
async function handleJson(res) {
  // 204 "No Content" responses have an empty body — nothing to parse.
  const data = res.status === 204 ? {} : await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

const api = {
  // --- Who am I? ---
  async getMe() {
    if (USE_FAKE_DATA) return { user: FAKE_CURRENT_USER };
    const res = await fetch("/api/auth/me");
    return handleJson(res);
  },

  // --- The feed ---
  async getFeed() {
    if (USE_FAKE_DATA) return fakeStore.map((t) => ({ ...t }));
    const res = await fetch("/api/posts");
    return handleJson(res);
  },

  // --- Sign up ---
  async signup(username, password) {
    if (USE_FAKE_DATA) return { user: { ...FAKE_CURRENT_USER, username } };
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return handleJson(res);
  },

  // --- Log in ---
  async login(username, password) {
    if (USE_FAKE_DATA) return { user: { ...FAKE_CURRENT_USER, username } };
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return handleJson(res);
  },

  // --- Log out ---
  async logout() {
    if (USE_FAKE_DATA) return {};
    const res = await fetch("/api/auth/logout", { method: "POST" });
    return handleJson(res);
  },

  // --- Create a tweet ---
  async createPost(content) {
    if (USE_FAKE_DATA) {
      const newTweet = {
        id: Date.now(), // any unique-ish number for the demo
        username: FAKE_CURRENT_USER.username,
        user_id: FAKE_CURRENT_USER.id,
        content,
        created_at: new Date().toISOString(),
        like_count: 0,
        liked_by_me: false,
      };
      fakeStore.unshift(newTweet);
      return { ...newTweet };
    }
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return handleJson(res);
  },

  // --- Delete a tweet ---
  async deletePost(id) {
    if (USE_FAKE_DATA) {
      fakeStore = fakeStore.filter((t) => t.id !== id);
      return {};
    }
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    return handleJson(res);
  },

  // --- Like a tweet ---
  async likePost(id) {
    if (USE_FAKE_DATA) {
      const t = fakeStore.find((t) => t.id === id);
      if (t && !t.liked_by_me) { t.liked_by_me = true; t.like_count++; }
      return {};
    }
    const res = await fetch(`/api/posts/${id}/like`, { method: "POST" });
    return handleJson(res);
  },

  // --- Unlike a tweet ---
  async unlikePost(id) {
    if (USE_FAKE_DATA) {
      const t = fakeStore.find((t) => t.id === id);
      if (t && t.liked_by_me) { t.liked_by_me = false; t.like_count--; }
      return {};
    }
    const res = await fetch(`/api/posts/${id}/like`, { method: "DELETE" });
    return handleJson(res);
  },

  // --- Save your own profile (bio + photo) ---
  async updateProfile(bio, avatarUrl) {
    if (USE_FAKE_DATA) {
      // Update the in-memory fake user, and stamp the new photo onto their
      // existing tweets so the change is visible everywhere, like the real API.
      FAKE_CURRENT_USER.bio = bio || null;
      FAKE_CURRENT_USER.avatar_url = avatarUrl || null;
      fakeStore.forEach((t) => {
        if (t.user_id === FAKE_CURRENT_USER.id) t.avatar_url = avatarUrl || null;
      });
      return { user: { ...FAKE_CURRENT_USER } };
    }
    const res = await fetch("/api/users/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio, avatar_url: avatarUrl }),
    });
    return handleJson(res);
  },

  // --- A user's profile ---
  async getProfile(username) {
    if (USE_FAKE_DATA) {
      const posts = fakeStore.filter((t) => t.username === username);
      return {
        user: { username, created_at: FAKE_CURRENT_USER.created_at },
        posts: posts.map((t) => ({ ...t })),
      };
    }
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`);
    return handleJson(res);
  },
};


// ============================================================================
//  ⑤  START THE APP
// ----------------------------------------------------------------------------
//  Find the empty <div id="root"> in index.html and render <App /> into it.
// ============================================================================
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
