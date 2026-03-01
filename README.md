# Chuck E. Cheese — Guest Check-In Tracker

A web app for logging guest counts by age group throughout the day. Data is stored in SQLite and exportable to PowerBI.

---

## URLs

| | URL | Who |
|---|---|---|
| **Staff app** | `http://192.168.20.66:41080` | Floor staff |
| **Admin panel** | `http://192.168.20.66:41081/admin.html` | IT / managers |
| **PowerBI JSON** | `http://192.168.20.66:41080/api/export/json` | PowerBI |
| **PowerBI CSV** | `http://192.168.20.66:41080/api/export/csv` | PowerBI |

---

## Project Structure

```
guest-tracker/
├── server.js          ← Node.js + Express (staff port 3000, admin port 3001)
├── package.json       ← Dependencies
├── backup.ps1         ← Daily DB backup script (run by Task Scheduler)
├── deploy.ps1         ← Deploy script: git pull + docker restart
├── Dockerfile         ← Ubuntu 24.04 + Node.js 20 + nginx
├── nginx.conf         ← Reverse proxy: port 41080 → Node :3000
├── start.sh           ← Container startup script
├── .gitignore
├── .gitattributes     ← Enforces LF line endings for Linux files
└── public/
    ├── index.html     ← HTML shell (staff app)
    ├── style.css      ← All styles
    ├── app.js         ← React frontend (staff app)
    └── admin.html     ← Admin panel (only served on port 41081)
```

---

## Production Server

**Machine:** `192.168.20.66` (Dell Inspiron 3020, Windows 11)
**Git clone:** `C:\GuestTracker\`

### Stack
```
Staff browser  → nginx :41080 → Node.js :3000 → SQLite (guests.db)
Admin browser  →        :41081 → Node.js :3001 ↗
```
Everything runs inside a single Docker container (Ubuntu 24.04).
`server.js` and `public/` are volume-mounted from the git clone — deploys are instant, no Docker rebuild needed.

### Port separation
- Port **41080** (staff): log visits, view today's summary, PowerBI export. No delete access.
- Port **41081** (admin): view all dates, delete any date's data. `admin.html` returns 404 on port 41080.

---

## Deploying an Update

### 1. On your dev PC — push to `main`
```bash
git checkout dev
git add .
git commit -m "your change"
git push

git checkout main
git merge dev
git push
```

### 2. Deploy to the server
```powershell
# On 192.168.20.66 (PowerShell):
powershell C:\GuestTracker\deploy.ps1
```

The deploy script does `git pull origin main` then `docker restart guest-tracker`. Takes ~3 seconds.

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — what runs on `192.168.20.66` |
| `dev`  | Development — test locally before merging |

---

## API Endpoints

### Staff port (41080)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/log` | Today's entries (`?date=YYYY-MM-DD` for another day) |
| `POST` | `/api/log` | Log a visit `{ hour, counts, firstTime }` |
| `GET`  | `/api/export/json` | All-time data as JSON (PowerBI) |
| `GET`  | `/api/export/csv`  | All-time data as CSV download |

### Admin port (41081)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/dates` | All dates with guest totals and entry counts |
| `DELETE` | `/api/log?date=YYYY-MM-DD` | Delete all records for a specific date |

---

## PowerBI Connection

### Option A — Live Web Connector (auto-refreshable)
1. PowerBI Desktop → **Get Data → Web**
2. URL: `http://192.168.20.66:41080/api/export/json`
3. Click **Refresh** in PowerBI to pull the latest data

### Option B — CSV Import
Download: `http://192.168.20.66:41080/api/export/csv`
Then: PowerBI → **Get Data → Text/CSV**

### Database Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-increment row ID |
| `visit_date` | TEXT | `YYYY-MM-DD` |
| `hour` | INTEGER | 0–23 |
| `toddler` | INTEGER | Ages 0–2 |
| `preschool` | INTEGER | Ages 3–5 |
| `school_age` | INTEGER | Ages 6–12 |
| `teen` | INTEGER | Ages 13–17 |
| `adult` | INTEGER | Ages 18+ |
| `total` | INTEGER | Sum of all age groups |
| `first_time` | INTEGER | First-time guests in this entry |
| `logged_at` | TEXT | Full timestamp |

---

## Automated Daily Backups

`backup.ps1` copies `guests.db` out of the container into `C:\GuestTracker\backups\` with a date-stamped filename and prunes backups older than 30 days. Already configured as a Windows scheduled task running at 2 AM as SYSTEM.

### Run a backup manually
```powershell
powershell C:\GuestTracker\backup.ps1
```

### Restore a backup
```powershell
docker stop guest-tracker
docker cp C:\GuestTracker\backups\guests_2026-02-28_0200.db guest-tracker:/app/guests.db
docker start guest-tracker
```

### Backup files
```
C:\GuestTracker\backups\
  guests_2026-02-28_0200.db
  guests_2026-02-27_0200.db
  ...  (30 days kept, older auto-deleted)
```

---

## Managing the Database

The SQLite database (`guests.db`) lives inside the Docker container at `/app/guests.db`.

### Delete records — Admin panel (easiest)
Open `http://192.168.20.66:41081/admin.html` — shows all dates with a Delete button per row.

### Delete records — SQLite shell
```powershell
docker exec -it guest-tracker bash
sqlite3 /app/guests.db
```
```sql
DELETE FROM visits WHERE visit_date = '2026-02-28';  -- specific day
DELETE FROM visits;                                    -- everything
```

### Copy DB out for inspection
```powershell
docker cp guest-tracker:/app/guests.db C:\GuestTracker\guests.db
# Open with DB Browser for SQLite (free): https://sqlitebrowser.org/
# Copy back:
docker cp C:\GuestTracker\guests.db guest-tracker:/app/guests.db
```

---

## Docker — Useful Commands

Run on the `192.168.20.66` machine:

```powershell
# Status
docker ps

# Logs
docker logs guest-tracker
docker logs guest-tracker --tail 50 --follow

# Restart (picks up new server.js / public/ instantly)
docker restart guest-tracker

# Stop / Start
docker stop guest-tracker
docker start guest-tracker

# Shell inside the container
docker exec -it guest-tracker bash

# Backup the database
docker cp guest-tracker:/app/guests.db C:\GuestTracker\backups\guests_backup.db
```

---

## Re-creating the Container

Required if you change port mappings or volume mounts. No image rebuild needed.

```powershell
docker stop guest-tracker
docker rm guest-tracker
docker run -d `
  -p 41080:41080 `
  -p 41081:3001 `
  --restart unless-stopped `
  --name guest-tracker `
  -v C:\GuestTracker\server.js:/app/server.js `
  -v C:\GuestTracker\public:/app/public `
  guest-tracker
```

## Re-building the Docker Image

Only needed if you change `Dockerfile`, `nginx.conf`, `start.sh`, or `package.json`.
**Must be run from a desktop PowerShell session on `192.168.20.66`** (not SSH — Windows credential manager blocks SSH builds).

```powershell
cd C:\GuestTracker
docker stop guest-tracker
docker rm guest-tracker
docker build -t guest-tracker .
docker run -d `
  -p 41080:41080 `
  -p 41081:3001 `
  --restart unless-stopped `
  --name guest-tracker `
  -v C:\GuestTracker\server.js:/app/server.js `
  -v C:\GuestTracker\public:/app/public `
  guest-tracker
```

---

## Running Locally (Development)

### Requirements
- [Node.js](https://nodejs.org) v18 or newer

### Setup
```bash
git clone https://github.com/jamesamat/guest-tracker.git
cd guest-tracker
npm install
npm start
```

- Staff app: **http://localhost:3000**
- Admin panel: **http://localhost:3001/admin.html**

---

## SSH Access to Server

```bash
ssh Admin@192.168.20.66
# Password: (see IT)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Staff site not loading | `docker ps` — check container is running |
| Admin panel not loading | Same — also confirm port 41081 is in the docker run command |
| Data not saving | `docker logs guest-tracker` — check for errors |
| Container stopped after reboot | `docker start guest-tracker` or check Docker service: `sc query com.docker.service` |
| Deploy script fails | Make sure git is in PATH: `C:\Program Files\Git\cmd\git.exe` |
| PowerBI can't connect | Check server is on, try opening the URL in a browser first |
| Backup task not running | Run manually: `powershell C:\GuestTracker\backup.ps1` — check for errors |
