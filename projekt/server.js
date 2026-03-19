const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

let db;
async function initDb() {
  db = await open({ filename: 'data.db', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'nots-tajny-klic-zmen-v-produkci',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));


// ── Auth middleware ───────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.redirect('/login');
}

// ── HTML stránky ──────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  if (req.session?.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Auth API ──────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Vyplň uživatelské jméno a heslo.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Heslo musí mít alespoň 6 znaků.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      username.trim().toLowerCase(), hash
    );
    req.session.userId = result.lastID;
    req.session.username = username.trim().toLowerCase();
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Uživatelské jméno je již obsazeno.' });
    res.status(500).json({ error: 'Chyba serveru.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Vyplň uživatelské jméno a heslo.' });

  const user = await db.get(
    'SELECT * FROM users WHERE username = ?',
    username.trim().toLowerCase()
  );

  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Špatné jméno nebo heslo.' });

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.session.username });
});

// ── Notes API ─────────────────────────────────────────────
app.get('/api/notes', requireAuth, async (req, res) => {
  const notes = await db.all(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC',
    req.session.userId
  );
  res.json(notes);
});

app.post('/api/notes', requireAuth, async (req, res) => {
  const { id, title, body, created_at, updated_at } = req.body;
  if (!id) return res.status(400).json({ error: 'Chybí id.' });
  await db.run(`
    INSERT INTO notes (id, user_id, title, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, updated_at=excluded.updated_at
  `, id, req.session.userId, title || '', body || '', created_at, updated_at);
  res.json({ ok: true });
});

app.delete('/api/notes/:id', requireAuth, async (req, res) => {
  await db.run(
    'DELETE FROM notes WHERE id = ? AND user_id = ?',
    req.params.id, req.session.userId
  );
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server běží na http://localhost:${PORT}`);
  });
});