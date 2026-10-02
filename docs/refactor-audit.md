# Refactor Audit — Control Point

Date: 2026-10-02
Branch audited: `main` @ `0c012277`
Author of record: Sushil Muthuvelkumar (all recent commits)

## 1. Repository state

- **Default branch:** `main` (origin/HEAD → origin/main). Working tree is on `main`, clean except for intentionally untracked items (`.github/`, one media JSON, one deleted ephemeral upload).
- **Recent history (last 15 commits):** all feature work from 2026-10-01/02 — presence, mentions, task-completion proof + tests, Bruno screenshots, Member-role permissions, Bruno team context, OG embed branding, FTC Scout URL fix, EmailImport 401 fix, role sync, AI usage logging, owner portal chart.
- **Open pull requests:** none (`gh pr list` empty).
- **Other branches:**
  - `feature/onboarding` — **stale**: 0 commits ahead of main, 141 behind. Last meaningful commit `346c3fd8` (per-account onboarding). Not active concurrent work; do not merge without review, do not delete unilaterally (Sushil's call).
  - `gh-pages` — Pages mirror of the frontend. Deploy artifact, not development.
- **"Concurrent developer" assessment:** there is no second active author in git history (single author on all 20 recent commits). The concurrent work to protect is the **in-session feature stream itself** — server.ts and src/App.tsx are being edited commit-by-commit, so any structural refactor must not fight that stream.

## 2. Hot files — actively under development (do not restructure these now)

Ranked by change frequency over the last 15 commits:

| File | Commits touching | Why it's hot |
|---|---|---|
| `server.ts` (~8.5k lines) | 8 | Every feature lands routes/migrations here: mentions meta, Member role perms, Bruno snapshot context, image sanitizing, presence, task proof |
| `src/App.tsx` (~9k lines) | 7 | Mention badge/toast, nav, presence polling, task dialog lift, role sync |
| `index.html` | 2 | OG/embed tags (just changed) |
| `src/services/aiService.ts` | 1 | Bruno image forwarding (just changed) |
| `src/components/BrunoPanel.tsx`, `BrunoView.tsx`, `ChatInput.tsx` | 1 each | Screenshot attach UI (just changed) |
| `ai.ts` | 1 | Bruno system prompt (just changed) |
| `src/components/voice/*` | 2 | Voice device settings (recent) |

## 3. Overlap analysis

- **No open PRs** → no PR-file overlap to avoid.
- **`feature/onboarding` vs main:** 147 files differ, but the branch is 141 commits stale with zero unique commits. Treat as archived, not concurrent. If it is ever revived, expect conflicts in `src/App.tsx`, `src/components/onboarding/*`, `server.ts` (onboarding endpoints), and `src/index.css`.
- **In-session overlap (the real risk):** today's commits touched `server.ts` sections that a refactor would also move (Bruno routes ~7160-7340, roles ~1476-1560, notifications meta, task proof ~5282-5470). A file-moving refactor started now would collide with the next feature commit. **Defer structural moves until the feature stream pauses.**

## 4. Architecture notes (no formal plan doc exists in-repo)

There is no `docs/architecture.md` or equivalent — the closest thing is `docs/voice-calling.md`. De-facto architecture:

- **Backend:** single-file Express app (`server.ts`) + `db.ts` (libSQL) + small modules (`server/voice.ts`, `server/cad.ts`, `server/onboarding.ts`, `server/youtube.ts`) + `ai.ts` / `ai-hybrid.ts` (provider routing).
- **Frontend:** `src/App.tsx` monolith (routing, nav, all views wired) + `src/components/*` feature components + `src/services/*`.
- **Tests:** vitest; `server/__tests__` uses real-server boot for route tests, in-memory libSQL for module tests.

## 5. Safe first stage (can proceed anytime)

These do not conflict with active work:

1. Add `docs/architecture.md` — write down the de-facto structure above.
2. Add shared type modules (`src/types/*` already started — extend, keep compatibility exports).
3. Add typed config utilities (env parsing with defaults).
4. Add path aliases in `vite.config.ts` / `tsconfig` (`@/*`).
5. Add tests and test helpers (no conflicts — additive).
6. Add feature `index.ts` barrels for `src/components/*` without moving files.
7. Add API/service boundary docs around existing `server/*` modules.

## 6. Deferred / high-conflict (do NOT do while the feature stream is active)

- Splitting `server.ts` (routes, migrations, WS handlers).
- Splitting `src/App.tsx` (shell, nav, views).
- Moving `src/voice/*` WebSocket/signaling code.
- Changing DB initialization or migration ordering.
- Changing auth/session/role code paths.
- Changing deploy config (Render, GH Pages mirror).

When the stream pauses, do these on a dedicated `refactor/*` branch (branched from latest `main`), in small reviewable moves with compatibility re-exports, one PR per subsystem, and rebase onto `main` before opening the PR.

## 7. Required report bookkeeping

- **Files changed by this refactor audit:** `docs/refactor-audit.md` (new). No code changed.
- **Intentionally untouched:** `server.ts`, `src/App.tsx`, `ai.ts`, `src/voice/*`, `src/components/Bruno*.tsx`, `index.html`, auth/role/DB-init code — all hot (see §2).
- **Detected overlap:** none with open PRs (there are none); `feature/onboarding` is stale, not concurrent — flagged, not acted on.
- **Compatibility exports added:** none (no code moved).
- **Follow-up PRs:** (a) `docs/architecture.md`; (b) per-subsystem split PRs from §6, only after feature work pauses — Sushil to confirm timing.
- **Manual conflicts requiring resolution:** none at this time.
