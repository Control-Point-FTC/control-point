// Database layer for Control Point.
// Uses @libsql/client: embedded SQLite file for local dev (`file:` URL),
// or a hosted Turso database in production via DATABASE_URL + DATABASE_AUTH_TOKEN.
//
// All helpers are async. `undefined` args are normalized to NULL.

import { createClient } from "@libsql/client";
import path from "path";

const DB_PATH = process.env.DATABASE_URL || path.join(process.cwd(), "dashboard.db");

export const dbClient = createClient({
  url: process.env.DATABASE_URL ? process.env.DATABASE_URL : `file:${DB_PATH}`,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

type Args = any[];
// `undefined` args are normalized to NULL. NaN is also normalized to NULL:
// a non-numeric id must never reach the driver (libsql throws a RangeError
// that would otherwise escape the request handler and kill the process).
const norm = (args: Args): Args =>
  args.map((a) => (a === undefined || (typeof a === "number" && Number.isNaN(a)) ? null : a));

export async function dbGet<T = any>(sql: string, ...args: Args): Promise<T | undefined> {
  const r = await dbClient.execute({ sql, args: norm(args) });
  return r.rows[0] as T | undefined;
}

export async function dbAll<T = any>(sql: string, ...args: Args): Promise<T[]> {
  const r = await dbClient.execute({ sql, args: norm(args) });
  return r.rows as T[];
}

export async function dbRun(
  sql: string,
  ...args: Args
): Promise<{ lastInsertRowid: number; changes: number }> {
  const r = await dbClient.execute({ sql, args: norm(args) });
  return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
}

export async function dbExec(sql: string): Promise<void> {
  await dbClient.executeMultiple(sql);
}

export async function dbBatch(stmts: { sql: string; args?: Args }[]): Promise<void> {
  await dbClient.batch(stmts.map((s) => ({ sql: s.sql, args: norm(s.args ?? []) })));
}
