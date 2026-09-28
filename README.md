# Control Point

Team management platform for robotics clubs — roster & permissions, attendance tracking, Kanban tasks, budget, inventory, outreach, team messaging, and a shared team calendar. Built on the open-source FTC Dashboard project, rebranded and extended.

## Quick start (local)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. On first run, create the admin account on the login screen.

## Features

- **Dashboard** — team health metrics, attendance trends, activity summaries
- **Teams & Members** — roster with role-based permissions and scopes
- **Attendance** — grid-based session tracking
- **Tasks** — Kanban board with assignments and due dates
- **Calendar** — shared team calendar: meetings, competitions, deadlines, socials
- **Budget** — income/expense tracking
- **Inventory, Outreach, Communications, Messaging** — parts, service hours, announcements, in-app chat
- **Sign-in** — email + password, or Google OAuth (when configured)
- **AI features** — currently stubbed; endpoints return `501` until an AI backend is wired up

## Configuration (`.env`)

```bash
# Database: embedded SQLite file by default. For production, use Turso:
# DATABASE_URL="libsql://your-db.turso.io"
# DATABASE_AUTH_TOKEN="your-turso-auth-token"

# Google OAuth (optional) — create credentials at
# https://console.cloud.google.com/apis/credentials
# Authorized redirect URI: <APP_URL>/api/auth/google/callback
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""

# Public URL of the app (used for OAuth callbacks)
# APP_URL="https://your-app.onrender.com"
```

Google sign-in only works for emails already on the team roster — an admin adds
members first via **Teams & Members**, then those people can link their Google account.

## Deploy (free)

1. Push this repo to GitHub.
2. Create a free Turso database at https://turso.tech and grab its URL + auth token.
3. (Optional) Create Google OAuth credentials for Google sign-in.
4. On https://render.com, create a **Web Service** from the repo — `render.yaml`
   is included as a blueprint. Set `DATABASE_URL`, `DATABASE_AUTH_TOKEN`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL` in the environment.

## Tech

React 19 + TypeScript + Tailwind CSS 4 (Vite) frontend, Express + WebSocket backend,
SQLite via `@libsql/client` (embedded file locally, Turso hosted in production).
