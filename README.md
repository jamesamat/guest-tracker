# Chuck E. Cheese — Guest Check-In Tracker

A web app for logging guest counts by age group throughout the day. Data is stored in SQLite and exportable to PowerBI.

---

## Project Structure

```
guest-tracker/
├── server.js          ← Node.js + Express REST API
├── package.json       ← Dependencies
├── Dockerfile         ← Ubuntu 24.04 + Node.js 20 + nginx
├── nginx.conf         ← Reverse proxy: port 41080 → Node :3000
├── start.sh           ← Container startup script
├── .gitignore
├── .gitattributes     ← Enforces LF line endings for Linux files
└── public/
    ├── index.html     ← HTML shell
    ├── style.css      ← All styles
    └── app.js         ← React frontend (talks to the API)
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

Open: **http://localhost:3000**

---

## Production Server

**Machine:** `192.168.20.66` (Dell Inspiron 3020, Windows 11)
**Live URL:** **http://192.168.20.66:41080**

### Stack
```
Browser → nginx :41080 → Node.js :3000 → SQLite (guests.db)
```
Everything runs inside a Docker container (Ubuntu 24.04).
App code is mounted from `C:\GuestTracker\` (the git clone) so deploys are instant — no Docker rebuild needed.

---

## Deploying an Update

### 1. On your PC — push changes to `main`
```bash
# Work on dev
git checkout dev
git add .
git commit -m "your change"
git push

# When ready for production
git checkout main
git merge dev
git push
```

### 2. Deploy to the server
**Via SSH from your PC:**
```bash
ssh Admin@192.168.20.66 "powershell C:\GuestTracker\deploy.ps1"
```

**Or directly on the server (PowerShell):**
```powershell
powershell C:\GuestTracker\deploy.ps1
```

The deploy script does:
1. `git pull origin main` — pulls latest code
2. `docker restart guest-tracker` — picks up the new files instantly

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — what runs on `192.168.20.66` |
| `dev`  | Development — test locally before merging |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/log` | Today's entries (add `?date=YYYY-MM-DD` for another day) |
| `POST` | `/api/log` | Log a visit `{ hour, counts }` |
| `DELETE` | `/api/log` | Clear today's data |
| `GET`  | `/api/export/json` | All-time data as JSON (PowerBI) |
| `GET`  | `/api/export/csv`  | All-time data as CSV download |

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
| `total` | INTEGER | Sum of all groups |
| `first_time` | INTEGER | First-time guests in this entry |
| `logged_at` | TEXT | Full timestamp |

---

## Managing the Database

The SQLite database (`guests.db`) lives in two places:

| Environment | Location |
|-------------|----------|
| Local dev (your PC) | `d:\Desktop\Projects\Websites\guest_tracker\guests.db` |
| Production (Docker) | Inside container at `/app/guests.db` |

### Deleting Records

**Option 1 — Reset Day button (UI)**
Clears today's entries via the button in the app.

**Option 2 — By date via API**
```bash
curl -X DELETE "http://192.168.20.66:41080/api/log?date=2026-02-28"
```

**Option 3 — Copy DB out, edit visually, copy back**
```powershell
# On 192.168.20.66 — copy out
docker cp guest-tracker:/app/guests.db C:\GuestTracker\guests.db

# Open with DB Browser for SQLite (free GUI): https://sqlitebrowser.org/
# Delete rows, save, then copy back:
docker cp C:\GuestTracker\guests.db guest-tracker:/app/guests.db
```

**Option 4 — SQLite shell inside the container**
```powershell
docker exec -it guest-tracker bash
sqlite3 /app/guests.db
```
```sql
-- Delete a specific day
DELETE FROM visits WHERE visit_date = '2026-02-28';

-- Delete everything
DELETE FROM visits;
```

---

## Docker — Useful Commands

Run on the `192.168.20.66` machine (PowerShell or SSH):

```powershell
# Status
docker ps

# Logs
docker logs guest-tracker
docker logs guest-tracker --tail 50 --follow

# Restart
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
  --restart unless-stopped `
  --name guest-tracker `
  -v C:\GuestTracker\server.js:/app/server.js `
  -v C:\GuestTracker\public:/app/public `
  guest-tracker
```

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
| Site not loading | `docker ps` — check container is running |
| Data not saving | `docker logs guest-tracker` — check for errors |
| Container stopped after reboot | `docker start guest-tracker` or check Docker service: `sc query com.docker.service` |
| Deploy script fails | Make sure git is in PATH: `C:\Program Files\Git\cmd\git.exe` |
| PowerBI can't connect | Check server is on, try opening URL in browser first |
