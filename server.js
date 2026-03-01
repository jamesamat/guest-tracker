const express  = require('express');
const Database = require('better-sqlite3');
const path     = require('path');

const app = express();
const db  = new Database(path.join(__dirname, 'guests.db'));

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
    logged_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Migration: add first_time column to existing databases
try {
  db.exec('ALTER TABLE visits ADD COLUMN first_time INTEGER NOT NULL DEFAULT 0');
} catch (_) { /* column already exists — safe to ignore */ }

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    counts: {
      toddler:   row.toddler,
      preschool: row.preschool,
      schoolAge: row.school_age,
      teen:      row.teen,
      adult:     row.adult,
    },
  };
}

// ─── API Routes ───────────────────────────────────────────────────────────────

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
  const { hour, counts, firstTime } = req.body;
  if (hour === undefined || !counts) {
    return res.status(400).json({ error: 'Missing hour or counts' });
  }

  const total  = Object.values(counts).reduce((a, b) => a + b, 0);
  const result = db.prepare(`
    INSERT INTO visits (visit_date, hour, toddler, preschool, school_age, teen, adult, total, first_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    todayStr(),
    hour,
    counts.toddler   || 0,
    counts.preschool || 0,
    counts.schoolAge || 0,
    counts.teen      || 0,
    counts.adult     || 0,
    total,
    firstTime        || 0,
  );

  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(result.lastInsertRowid);
  res.json(rowToEntry(row));
});

// DELETE /api/log?date=YYYY-MM-DD  (default: today)
app.delete('/api/log', (req, res) => {
  const date = req.query.date || todayStr();
  const info = db.prepare('DELETE FROM visits WHERE visit_date = ?').run(date);
  res.json({ deleted: info.changes });
});

// GET /api/dates  — list of all dates with entry count and guest totals
app.get('/api/dates', (_req, res) => {
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

// ─── PowerBI Export Routes ────────────────────────────────────────────────────

// GET /api/export/json  — full history as JSON (PowerBI Web connector)
app.get('/api/export/json', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM visits ORDER BY visit_date, hour, id')
    .all();
  res.json(rows);
});

// GET /api/export/csv  — full history as CSV (downloadable or PowerBI Web)
app.get('/api/export/csv', (req, res) => {
  const rows    = db.prepare('SELECT * FROM visits ORDER BY visit_date, hour, id').all();
  const headers = ['id', 'visit_date', 'hour', 'toddler', 'preschool', 'school_age', 'teen', 'adult', 'total', 'first_time', 'logged_at'];
  const lines   = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="guest_data.csv"');
  res.send(lines.join('\r\n'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Guest Tracker  →  http://localhost:${PORT}`);
  console.log(`SQLite DB      →  ${path.join(__dirname, 'guests.db')}`);
  console.log(`PowerBI JSON   →  http://localhost:${PORT}/api/export/json`);
  console.log(`PowerBI CSV    →  http://localhost:${PORT}/api/export/csv`);
});
