# Chuck E. Cheese – Guest Check-In Tracker

## Project structure

```
guest_tracker/
├── server.js       ← Node.js + Express REST API
├── package.json    ← Dependencies (Express, better-sqlite3)
├── guests.db       ← SQLite database (auto-created on first run)
└── public/
    ├── index.html  ← HTML shell
    ├── style.css   ← All styles
    └── app.js      ← React frontend (talks to the API)
```

---

## Setup & run

### Requirements
- [Node.js](https://nodejs.org) v18 or newer

### Install dependencies
```bash
cd guest_tracker
npm install
```

### Start the server
```bash
npm start
```

Open your browser (or tablet/phone on the same network) to:
```
http://localhost:3000
```

To access from another device:
```
http://<your-machine-ip>:3000
```

Find your IP on Windows: `ipconfig` → look for IPv4 Address.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/log` | Today's entries (add `?date=YYYY-MM-DD` for another day) |
| `POST` | `/api/log` | Add a visit entry `{ hour, counts }` |
| `DELETE` | `/api/log` | Clear today's data (add `?date=YYYY-MM-DD` for another day) |
| `GET` | `/api/export/json` | **All-time data as JSON** (for PowerBI Web connector) |
| `GET` | `/api/export/csv` | **All-time data as CSV download** |

---

## Connecting PowerBI

### Option A — Web connector (live, refreshable)
1. Open PowerBI Desktop → **Get Data → Web**
2. Enter URL: `http://localhost:3000/api/export/json`
3. PowerBI will parse the JSON table automatically
4. Click **Refresh** in PowerBI to pull the latest data

> If PowerBI needs to reach the server from a different machine,
> replace `localhost` with the server machine's IP address.

### Option B — CSV import
1. Open `http://localhost:3000/api/export/csv` in a browser to download `guest_data.csv`
2. In PowerBI Desktop → **Get Data → Text/CSV** → select the downloaded file

### SQLite database columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment row ID |
| `visit_date` | TEXT | `YYYY-MM-DD` local date |
| `hour` | INTEGER | 0–23 hour the group was logged |
| `toddler` | INTEGER | Count for ages 0–2 |
| `preschool` | INTEGER | Count for ages 3–5 |
| `school_age` | INTEGER | Count for ages 6–12 |
| `teen` | INTEGER | Count for ages 13–17 |
| `adult` | INTEGER | Count for ages 18+ |
| `total` | INTEGER | Sum of all age groups |
| `logged_at` | TEXT | Full timestamp (`YYYY-MM-DD HH:MM:SS`) |

---

## Notes
- `guests.db` is a standard SQLite file — open it with [DB Browser for SQLite](https://sqlitebrowser.org/) to inspect data directly.
- Data does **not** auto-reset; each day's records are stored with their date.
- The "Reset Day" button in the UI deletes only today's rows.
- Requires internet access on the browser device for Google Fonts (cosmetic only — the app works without them).
