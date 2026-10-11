// What a member lets Bruno use (Settings → Bruno → What Bruno can use). Every
// path that hands notebook text to the model goes through these gates, so a
// switched-off member's notebook never reaches it.
import type { LookupQuery } from "./brunoLookup.js";

type DbGet = (sql: string, ...args: any[]) => Promise<any>;
export type BrunoAccess = { notebook: boolean; sticky: boolean };
type Rows = { lines: string[]; more: boolean };

export const BRUNO_NOTEBOOK_OFF = "Bruno's notebook access is turned off in Settings → Bruno.";
export const BRUNO_STICKY_OFF = "Bruno's sticky notes access is turned off in Settings → Bruno.";

/** Both switches default on (a missing row or column reads as on). */
export async function brunoAccess(dbGet: DbGet, memberId: number): Promise<BrunoAccess> {
  const row = await dbGet("SELECT COALESCE(bruno_notebook, 1) AS notebook, COALESCE(bruno_sticky, 1) AS sticky FROM members WHERE id = ?", memberId);
  return { notebook: Number(row?.notebook ?? 1) === 1, sticky: Number(row?.sticky ?? 1) === 1 };
}

/** A notebook lookup runner that never reads the notebook when access is off. */
export function gatedNotebookLookup(access: BrunoAccess, run: (q: LookupQuery) => Promise<Rows>) {
  return (q: LookupQuery): Promise<Rows> => access.notebook ? run(q) : Promise.resolve({ lines: [BRUNO_NOTEBOOK_OFF], more: false });
}

/** A sticky notes lookup runner that never reads the notes when access is off. */
export function gatedStickyLookup(access: BrunoAccess, run: (q: LookupQuery) => Promise<Rows>) {
  return (q: LookupQuery): Promise<Rows> => access.sticky ? run(q) : Promise.resolve({ lines: [BRUNO_STICKY_OFF], more: false });
}

/** The open notebook page's brief for the screen context, only when allowed. */
export async function gatedNotebookBrief<T>(access: BrunoAccess, brief: () => Promise<T>): Promise<T | undefined> {
  return access.notebook ? brief() : undefined;
}
