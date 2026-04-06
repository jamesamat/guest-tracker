const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

// Load .env if present (no dotenv dependency — plain key=value parser)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  });
}

const app      = express();
const adminApp = express();
const db       = new Database(path.join(__dirname, 'guests.db'));

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_date TEXT    NOT NULL,
    hour       INTEGER NOT NULL,
    toddler    INTEGER NOT NULL DEFAULT 0,
    preschool  INTEGER NOT NULL DEFAULT 0,
    school_age INTEGER NOT NULL DEFAULT 0,
    teen       INTEGER NOT NULL DEFAULT 0,
    adult      INTEGER NOT NULL DEFAULT 0,
    total      INTEGER NOT NULL DEFAULT 0,
    first_time INTEGER NOT NULL DEFAULT 0,
    residence  TEXT    NOT NULL DEFAULT '',
    logged_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Migration: add first_time column to existing databases
try {
  db.exec('ALTER TABLE visits ADD COLUMN first_time INTEGER NOT NULL DEFAULT 0');
} catch (_) { /* column already exists — safe to ignore */ }

// Migration: add residence column to existing databases
try {
  db.exec("ALTER TABLE visits ADD COLUMN residence TEXT NOT NULL DEFAULT ''");
} catch (_) { /* column already exists — safe to ignore */ }

// Migration: add district + resort columns to existing databases
try {
  db.exec("ALTER TABLE visits ADD COLUMN district TEXT NOT NULL DEFAULT ''");
} catch (_) { /* column already exists — safe to ignore */ }
try {
  db.exec("ALTER TABLE visits ADD COLUMN resort TEXT NOT NULL DEFAULT ''");
} catch (_) { /* column already exists — safe to ignore */ }

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
adminApp.use(express.json());

// Block admin.html on the staff-facing app (dashboard.html is allowed — it has its own login)
app.get('/admin.html', (_req, res) => res.status(404).end());

// Protect /api/dashboard on the public staff port with token auth
app.get('/api/dashboard', requireDashAuth, (_req, res) => {
  // proxy to the same handler defined below on adminApp — reuse query logic inline
  _req.app._dashboardHandler(_req, res);
});

// Serve public/ on both apps (admin.html is accessible on adminApp only)
app.use(express.static(path.join(__dirname, 'public')));
adminApp.use(express.static(path.join(__dirname, 'public')));

// ─── Dashboard auth ────────────────────────────────────────────────────────────
// DASHBOARD_PASSWORD must be set in .env / docker env.
// Login: POST /api/dashboard-login { password } → { token }
// Token is HMAC-SHA256(password, secret) — stateless, no DB required.
// Valid for 12 hours (encoded in the token payload).

function makeDashToken(password) {
  const secret  = process.env.DASHBOARD_PASSWORD || '';
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const payload = `${expires}`;
  const sig     = crypto.createHmac('sha256', secret + password).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyDashToken(token) {
  if (!token) return false;
  const secret   = process.env.DASHBOARD_PASSWORD || '';
  const parts    = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expires  = parseInt(payload, 10);
  if (isNaN(expires) || Date.now() > expires) return false;
  // Recompute sig — try all valid passwords (just one here)
  const expected = crypto.createHmac('sha256', secret + secret).update(payload).digest('hex');
  // constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function requireDashAuth(req, res, next) {
  if (!process.env.DASHBOARD_PASSWORD) return next(); // not configured — open
  const token = req.headers['x-dash-token'] || req.query.dash_token;
  if (!verifyDashToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── Export API key middleware ─────────────────────────────────────────────────
// Set EXPORT_API_KEY in environment to require a key on export routes.
// If not set the routes remain open (backward compat with existing PowerBI connectors).
function requireExportKey(req, res, next) {
  const secret = process.env.EXPORT_API_KEY;
  if (!secret) return next();
  const provided = req.query.key || req.headers['x-api-key'];
  if (provided !== secret) return res.status(401).json({ error: 'Invalid or missing API key' });
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() {
  const d   = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Map a flat DB row back to the shape the React client expects
function rowToEntry(row) {
  return {
    id:        row.id,
    hour:      row.hour,
    firstTime: row.first_time,
    residence: row.residence || '',
    district:  row.district  || '',
    resort:    row.resort    || '',
    counts: {
      toddler:   row.toddler,
      preschool: row.preschool,
      schoolAge: row.school_age,
      teen:      row.teen,
      adult:     row.adult,
    },
  };
}

// ─── Dashboard login (public — both ports) ────────────────────────────────────
function addLoginRoute(appInstance) {
  appInstance.post('/api/dashboard-login', (req, res) => {
    const { password } = req.body;
    const secret = process.env.DASHBOARD_PASSWORD;
    if (!secret) return res.status(503).json({ error: 'Dashboard auth not configured' });
    if (!password || password !== secret) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    res.json({ token: makeDashToken(password) });
  });
}
addLoginRoute(app);
addLoginRoute(adminApp);

// ─── Staff API Routes (port 3000 / 41080) ─────────────────────────────────────

// GET /api/log?date=YYYY-MM-DD  (default: today)
app.get('/api/log', (req, res) => {
  const date = req.query.date || todayStr();
  const rows = db
    .prepare('SELECT * FROM visits WHERE visit_date = ? ORDER BY hour, id')
    .all(date);
  res.json(rows.map(rowToEntry));
});

// POST /api/log  — body: { hour, firstTime, counts: { toddler, preschool, schoolAge, teen, adult } }
app.post('/api/log', (req, res) => {
  const { date, hour, counts, firstTime, residence, district, resort } = req.body;
  if (hour === undefined || !counts) {
    return res.status(400).json({ error: 'Missing hour or counts' });
  }

  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  const result = db.prepare(`
    INSERT INTO visits (visit_date, hour, toddler, preschool, school_age, teen, adult, total, first_time, residence, district, resort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date || todayStr(),
    hour,
    counts.toddler   || 0,
    counts.preschool || 0,
    counts.schoolAge || 0,
    counts.teen      || 0,
    counts.adult     || 0,
    total,
    firstTime        || 0,
    residence        || '',
    district         || '',
    resort           || '',
  );

  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(result.lastInsertRowid);
  res.json(rowToEntry(row));
});

// ─── PowerBI Export Routes (staff port) ───────────────────────────────────────

// GET /api/export/json  — full history as JSON (PowerBI Web connector)
app.get('/api/export/json', requireExportKey, (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM visits ORDER BY visit_date, hour, id')
    .all();
  res.json(rows);
});

// GET /api/export/csv  — full history as CSV (downloadable or PowerBI Web)
app.get('/api/export/csv', requireExportKey, (_req, res) => {
  const rows    = db.prepare('SELECT * FROM visits ORDER BY visit_date, hour, id').all();
  const headers = ['id', 'visit_date', 'hour', 'toddler', 'preschool', 'school_age', 'teen', 'adult', 'total', 'first_time', 'residence', 'district', 'resort', 'logged_at'];
  const lines   = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="guest_data.csv"');
  res.send(lines.join('\r\n'));
});

// ─── Admin API Routes (port 3001 / 41081 only) ────────────────────────────────

// GET /api/dashboard  — summary stats for manager dashboard
function dashboardHandler(_req, res) {
  const totals = db.prepare(`
    SELECT
      SUM(total)      AS total_guests,
      SUM(first_time) AS total_first_time,
      SUM(toddler)    AS total_toddler,
      SUM(preschool)  AS total_preschool,
      SUM(school_age) AS total_school_age,
      SUM(teen)       AS total_teen,
      SUM(adult)      AS total_adult,
      COUNT(DISTINCT visit_date) AS total_days
    FROM visits
  `).get();

  const today = db.prepare(`
    SELECT
      SUM(total)      AS guests,
      SUM(first_time) AS first_time,
      SUM(toddler)    AS toddler,
      SUM(preschool)  AS preschool,
      SUM(school_age) AS school_age,
      SUM(teen)       AS teen,
      SUM(adult)      AS adult
    FROM visits WHERE visit_date = ?
  `).get(todayStr());

  const byDay = db.prepare(`
    SELECT visit_date, SUM(total) AS guests, SUM(first_time) AS first_time
    FROM visits GROUP BY visit_date ORDER BY visit_date
  `).all();

  const byHour = db.prepare(`
    SELECT hour, SUM(total) AS guests
    FROM visits GROUP BY hour ORDER BY hour
  `).all();

  const byResidence = db.prepare(`
    SELECT
      CASE WHEN residence = '' OR residence IS NULL THEN 'Unknown' ELSE residence END AS residence,
      district, resort,
      SUM(total) AS guests
    FROM visits
    GROUP BY residence, district, resort
    ORDER BY guests DESC
    LIMIT 20
  `).all();

  res.json({ totals, today, byDay, byHour, byResidence });
}

// Register dashboard handler on admin port (no auth needed — admin port is internal only)
adminApp.get('/api/dashboard', dashboardHandler);

// Register on public staff port behind token auth
app._dashboardHandler = dashboardHandler;

// GET /api/dates  — all dates with totals
adminApp.get('/api/dates', (_req, res) => {
  const rows = db.prepare(`
    SELECT visit_date,
           COUNT(*)        AS entries,
           SUM(total)      AS guests,
           SUM(first_time) AS first_timers
    FROM visits
    GROUP BY visit_date
    ORDER BY visit_date DESC
  `).all();
  res.json(rows);
});

// DELETE /api/log?date=YYYY-MM-DD  — delete all entries for a date
adminApp.delete('/api/log', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date query parameter required' });
  const info = db.prepare('DELETE FROM visits WHERE visit_date = ?').run(date);
  res.json({ deleted: info.changes });
});

// GET /api/entries?date=YYYY-MM-DD  — individual entries for a date
adminApp.get('/api/entries', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date required' });
  const rows = db.prepare('SELECT * FROM visits WHERE visit_date = ? ORDER BY hour, id').all(date);
  res.json(rows);
});

// DELETE /api/entry/:id  — delete a single entry by row ID
adminApp.delete('/api/entry/:id', (req, res) => {
  const id   = parseInt(req.params.id, 10);
  if (!id)   return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare('DELETE FROM visits WHERE id = ?').run(id);
  res.json({ deleted: info.changes });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Guest Tracker  →  http://localhost:${PORT}  (staff, nginx → 41080)`);
  console.log(`SQLite DB      →  ${path.join(__dirname, 'guests.db')}`);
  console.log(`PowerBI JSON   →  http://localhost:${PORT}/api/export/json`);
  console.log(`PowerBI CSV    →  http://localhost:${PORT}/api/export/csv`);
});

adminApp.listen(ADMIN_PORT, () => {
  console.log(`Admin Panel    →  http://localhost:${ADMIN_PORT}  (admin, direct → 41081)`);
});
