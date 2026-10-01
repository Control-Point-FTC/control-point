import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Point the db layer at a scratch file BEFORE the runner (and db.js) load.
const scratchDb = join(tmpdir(), `mig-test-${process.pid}.db`);
process.env.DATABASE_URL = `file:${scratchDb}`;
const { runMigrations, getAppliedVersions, listMigrations } = await import('../runner');
const { dbAll } = await import('../../db.js');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mig-versions-'));
  writeFileSync(join(dir, '002-add-index.sql'),
    `CREATE INDEX IF NOT EXISTS idx_migtest_name ON migtest(name);`);
  writeFileSync(join(dir, '001-create-table.sql'),
    `CREATE TABLE IF NOT EXISTS migtest (id INTEGER PRIMARY KEY, name TEXT);`);
  writeFileSync(join(dir, 'notes.txt'), 'ignored');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(scratchDb, { force: true });
  rmSync(`${scratchDb}-journal`, { force: true });
});

describe('migration runner', () => {
  it('applies pending migrations in version order and records them', async () => {
    const applied = await runMigrations(dir);
    expect(applied).toEqual(['001', '002']);

    const tables = (await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='migtest'")) as any[];
    expect(tables.length).toBe(1);
    const idx = (await dbAll(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_migtest_name'")) as any[];
    expect(idx.length).toBe(1);

    const versions = await getAppliedVersions();
    expect(versions.has('001')).toBe(true);
    expect(versions.has('002')).toBe(true);
  });

  it('is idempotent: second run applies nothing', async () => {
    await runMigrations(dir);
    const again = await runMigrations(dir);
    expect(again).toEqual([]);
  });

  it('listMigrations sorts and ignores non-matching files', () => {
    const list = listMigrations(dir);
    expect(list.map((m) => m.version)).toEqual(['001', '002']);
  });

  it('listMigrations returns [] for a missing directory', () => {
    expect(listMigrations(join(dir, 'nope'))).toEqual([]);
  });
});
