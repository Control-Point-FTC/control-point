# migrations/versions

Versioned SQL migrations, applied in filename order by `migrations/runner.ts`.

## Naming

`NNN-short-description.sql` — e.g. `001-add-task-priority.sql`.
Numbers must be zero-padded and unique. The runner records applied versions in
the `schema_migrations` table and never re-runs them.

## Baseline

Everything the server created before 2026-10-01 lives in the inline boot DDL
in `server.ts` and is the implicit baseline. This directory starts empty:
the first real schema change after the runner landed gets `001-...`.

## Rules

- Keep each file to one logical change.
- Prefer idempotent statements (`IF NOT EXISTS`, guarded `ALTER TABLE`) so a
  half-applied migration can be re-run.
- Wrap multi-statement changes in `BEGIN; ... COMMIT;` when atomicity matters.
- **Foreign-key safety** (see `runner.ts` header): never `RENAME` a table that
  other tables reference. Rebuild via `<table>_new` → copy → drop original →
  rename the stage. The runner warns loudly on `RENAME TO`.
