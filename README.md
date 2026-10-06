<div align="center">

# Control Point

**The all-in-one HQ for FTC robotics teams.**

Tasks, scouting, build tracking, CAD, and an AI coach — in one place.

**Live at [tryctrlpoint.org](https://tryctrlpoint.org)**

</div>

---

Control Point is a full-stack team management platform built for FIRST Tech Challenge teams. It covers everything a team needs across a season: who’s on the team, when they meet, what needs building, how the robot performs, and whether you’re on track to advance.

## What’s inside

**Bruno — your FTC coach.** An AI assistant that lives in the app, not in a separate tab. Ask it build questions, have it write Java for your OpModes, or let it take action directly: log emails, create tasks, schedule events. It knows what page you’re on and suggests what it can do there.

**Predict (beta) — advancement forecasting.** Not a guess — a calibrated prediction engine:
- **Ratings** — EPA-style team ratings carried across events with time decay, so 5–6 quals per event still produce signal instead of noise
- **Match predictor** — win probabilities and expected scores from head-to-head ratings, with noise fitted on real results
- **Event simulator** — Monte Carlo simulation of the full event: quals, alliance selection, playoffs
- **Calibration first** — tuned on 2024–25, tested on 2025–26 with strict temporal splits (no leakage). A model that says 70% and is right 70% of the time beats one that says 95% and isn’t
- **Team-specific award priors** — built from each team’s own award history, because Inspire alone can decide advancement

See [docs/predict/](docs/predict/) for the full methodology and back-test reports.

**Team Stats — scouting that works.** Live event data, OPR breakdowns (auto / teleop / endgame), and alliance scenario planning.

**The fundamentals, done right.**
- **Dashboard** — team health at a glance: attendance, tasks, budget, upcoming events, and Bruno’s briefing on what matters today
- **Tasks** — Kanban board with assignments, due dates, and priorities
- **Attendance** — session tracking with QR check-in
- **Calendar** — shared team calendar: meetings, competitions, deadlines
- **Communication** — a real log with email-style reply threads, inbound/outbound tracking, and Bruno-assisted email import
- **Messaging** — team channels with mentions and threads
- **Budget** — income/expense tracking with a running balance
- **Inventory** — parts tracking with low-stock alerts
- **Outreach** — log service hours and events
- **CAD & Code** — model viewer and robot code management tied to the team
- **Members & Roles** — roster with granular role-based permissions
- **Voice channels** — open team voice rooms anyone can join
- **Owner portal** — usage, AI controls, and feature flags

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Create the admin account on the login screen — you’re up and running with a local SQLite database.

## Configuration

Copy the essentials into a `.env` file:

```bash
# Database — embedded SQLite file by default. Production uses Turso:
# DATABASE_URL="libsql://your-db.turso.io"
# DATABASE_AUTH_TOKEN="your-turso-auth-token"

# Public URL (used for OAuth callbacks)
# APP_URL="https://tryctrlpoint.org"

# Google OAuth (optional)
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""

# Discord OAuth (optional)
# DISCORD_CLIENT_ID=""
# DISCORD_CLIENT_SECRET=""

# AI (Bruno) — Gemini for chat, grounded research, and vision; Anthropic as fallback
# GEMINI_API_KEY=""
# ANTHROPIC_API_KEY=""
```

Google sign-in only works for emails already on the team roster — an admin adds members first, then they link their Google account.

## Deploy

Production runs on an Oracle Cloud Always Free VM: nginx → the app on `:3000` via systemd, with Turso as the hosted database. Push to `main`, deploy, restart the service.

## Tech

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 (Vite), shadcn/ui on Radix primitives
- **Backend:** Express + WebSocket
- **Database:** SQLite via `@libsql/client` — embedded file locally, Turso hosted in production
- **AI:** Gemini (chat, grounded research, vision) with Anthropic fallback, per-user controls and usage tracking

## Contributing

Every change goes through a pull request and gets reviewed to a 5/5 confidence score before merging. Keep commits small, meaningful, and buildable.

## License

MIT
