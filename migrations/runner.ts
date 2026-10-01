// Versioned database migration runner for Control Point.
//
// How it works:
//   - Migration files live in ./versions/ and are named `NNN-description.sql`
//     (e.g. `001-add-task-priority.sql`), applied in version order.
//   - Applied versions are recorded in the `schema_migrations` table, so each
//     migration runs exactly once per database.
//   - The pre-existing inline boot DDL in server.ts is the "baseline": the
//     runner executes AFTER it, so versioned migrations only need to describe
//     changes made from 2026-10-01 onward.
//
// SQLite foreign-key safety rules (learned the hard way, 2026-09-29):
//   1. NEVER `ALTER TABLE <t> RENAME TO <other>` when other tables reference
//      `<t>` — SQLite rewrites every FOREIGN KEY clause to the new name, and
//      dropping the renamed table then fails. This applies even with
//      `PRAGMA foreign_keys=OFF` in the same executeMultiple batch (drivers
//      may prepare the batch before the pragma runs).
//   2. Table rebuilds: CREATE `<t>_new`, copy rows, DROP `<t>`,
//      `ALTER TABLE <t>_new RENAME TO <t>` (renaming the *unstaged* name
//      rewrites nothing). Wrap in a single transaction.
//   3. The runner logs a loud warning if a migration contains RENAME TO —
//      review it by hand before it ships.
//
// Migrations should be idempotent where cheap (IF NOT EXISTS / guarded ALTERs)
// so a half-applied migration can be re-run safely.

import { dbAll, dbExec, dbRun } from "../db.js";
import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const VERSIONS_DIR = join(here, "versions");

export interface Migration {
  version: string; // "001"
  name: string;    // "001-add-task-priority"
  sql: string;
}

export function listMigrations(versionsDir: string = VERSIONS_DIR): Migration[] {
  let files: string[];
  try {
    files = readdirSync(versionsDir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /^\d{3}-.+\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: f.slice(0, 3),
      name: f.replace(/\.sql$/, ""),
      sql: readFileSync(join(versionsDir, f), "utf8"),
    }));
}

export async function ensureMigrationsTable(): Promise<void> {
  await dbExec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export async function getAppliedVersions(): Promise<Set<string>> {
  await ensureMigrationsTable();
  const rows = (await dbAll("SELECT version FROM schema_migrations")) as any[];
  return new Set(rows.map((r) => String(r.version)));
}

/** Apply pending migrations in order. Returns the versions applied. */
export async function runMigrations(versionsDir?: string): Promise<string[]> {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();
  const pending = listMigrations(versionsDir).filter((m) => !applied.has(m.version));
  const done: string[] = [];
  for (const m of pending) {
    if (/RENAME\s+TO/i.test(m.sql)) {
      console.warn(
        `[migrations] WARNING: ${m.name} contains RENAME TO — verify no referenced table is renamed (see runner.ts FK rules).`
      );
    }
    console.log(`[migrations] applying ${m.name}...`);
    // A migration is one file = one logical change; executeMultiple runs its
    // statements in order. Keep each file's statements transactional by
    // wrapping them in BEGIN/COMMIT inside the file when atomicity matters.
    await dbExec(m.sql);
    await dbRun("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", m.version, m.name);
    done.push(m.version);
  }
  if (done.length) console.log(`[migrations] applied ${done.length}: ${done.join(", ")}`);
  return done;
}
