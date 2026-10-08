// Bruno data lookups (V3.5 phase 4b). Bruno only sees a summary of the
// workspace in its prompt; when a question needs more ("what did Arnav say on
// October 6 in #general?", "which tasks did we finish last week?") it ends its
// reply with a ```lookup block. The server runs the query against this
// team's data, hands the rows back to the model, and the model answers from
// them in a second pass. The block itself is never shown to the user.
//
// Every query is scoped to the asking member's team. Team chat has no private
// channels, so any member's Bruno may read any channel; deleted messages are
// never returned.

export type LookupKind = "messages" | "tasks" | "events" | "communications" | "outreach" | "budget";
export interface LookupQuery {
  kind: LookupKind;
  /** Words to find (all must appear). */
  query?: string;
  /** Messages: channel name ("general", "#build"). */
  channel?: string;
  /** Messages: sender. Tasks: assignee. Communications: recipient. */
  person?: string;
  /** YYYY-MM-DD, inclusive, in the team's timezone. */
  from?: string;
  to?: string;
  /** Tasks: "todo" | "in-progress" | "done" | "open". */
  status?: string;
}

type DbAll = (sql: string, ...args: any[]) => Promise<any[]>;

const KINDS: LookupKind[] = ["messages", "tasks", "events", "communications", "outreach", "budget"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LOOKUP_RE = /```lookup\s*\r?\n([\s\S]*?)\r?\n?```/g;
export const MAX_LOOKUPS = 3;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The ```lookup queries in a reply (at most MAX_LOOKUPS) and the reply without them. */
export function extractLookupBlocks(text: string): { text: string; queries: LookupQuery[] } {
  const src = String(text || "");
  const queries: LookupQuery[] = [];
  for (const m of src.matchAll(LOOKUP_RE)) {
    let parsed: any;
    try { parsed = JSON.parse(m[1]); } catch { continue; }
    for (const q of Array.isArray(parsed) ? parsed : [parsed]) {
      if (!q || !KINDS.includes(q.kind) || queries.length >= MAX_LOOKUPS) continue;
      queries.push({
        kind: q.kind,
        ...(str(q.query, 120) ? { query: str(q.query, 120) } : {}),
        ...(str(q.channel, 60) ? { channel: str(q.channel, 60).replace(/^#/, "") } : {}),
        ...(str(q.person, 80) ? { person: str(q.person, 80).replace(/^@/, "") } : {}),
        ...(ISO.test(q.from) ? { from: q.from } : {}),
        ...(ISO.test(q.to) ? { to: q.to } : {}),
        ...(str(q.status, 20) ? { status: str(q.status, 20).toLowerCase() } : {}),
      });
    }
  }
  return { text: src.replace(LOOKUP_RE, "").replace(/```lookup[\s\S]*$/, "").trim(), queries };
}

/**
 * Streams model text through, holding back a ```lookup block (and anything
 * after it) so the user never sees the raw query. `push` returns what may be
 * shown now; `end` returns whatever was safely held back at the end.
 */
export function createLookupHold() {
  const MARK = "```lookup";
  let all = "";
  let shown = 0;
  let blocked = false;
  return {
    push(chunk: string): string {
      all += chunk;
      if (blocked) return "";
      const at = all.indexOf(MARK, Math.max(0, shown - MARK.length));
      if (at >= 0) {
        blocked = true;
        const out = all.slice(shown, at);
        shown = at;
        return out;
      }
      // Keep back a tail that could be the start of the marker.
      let keep = 0;
      for (let k = Math.min(MARK.length - 1, all.length - shown); k > 0; k--) {
        if (MARK.startsWith(all.slice(all.length - k))) { keep = k; break; }
      }
      const out = all.slice(shown, all.length - keep);
      shown = all.length - keep;
      return out;
    },
    end(): string {
      if (blocked) return "";
      const out = all.slice(shown);
      shown = all.length;
      return out;
    },
    get blocked() { return blocked; },
  };
}

/** UTC ms of 00:00 on `date` in `tz` (DST-safe). */
export function zonedMidnightMs(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const offset = (ms: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(ms))) if (part.type !== "literal") p[part.type] = Number(part.value);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  let guess = wall - offset(wall);
  guess = wall - offset(guess);
  return guess;
}
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
/** "AND (col1 LIKE ? OR col2 LIKE ?)" for every word of the query (max 5 words). */
function wordsWhere(query: string | undefined, cols: string[]): { sql: string; args: string[] } {
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
  if (!words.length) return { sql: "", args: [] };
  const sql = words.map(() => ` AND (${cols.map((c) => `LOWER(${c}) LIKE ? ESCAPE '\\'`).join(" OR ")})`).join("");
  const args = words.flatMap((w) => cols.map(() => `%${likeEsc(w)}%`));
  return { sql, args };
}
const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const utcFrom = (date: string, tz: string) => new Date(zonedMidnightMs(date, tz)).toISOString();
const utcBefore = (date: string, tz: string) => new Date(zonedMidnightMs(nextDay(date), tz)).toISOString();

/** Rows past the limit mean the list is cut short; say so instead of letting it read as complete. */
function capped<T>(rows: T[], limit: number): { rows: T[]; more: boolean } {
  return rows.length > limit ? { rows: rows.slice(0, limit), more: true } : { rows, more: false };
}

function when(ms: number, tz: string) {
  return new Date(ms).toLocaleString("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

interface LookupRows { lines: string[]; more: boolean; summary?: string }

async function runOne(db: DbAll, teamId: number, tz: string, q: LookupQuery): Promise<LookupRows> {
  const lines: string[] = [];
  let more = false;
  let summary: string | undefined;
  if (q.kind === "messages") {
    const w = wordsWhere(q.query, ["m.content"]);
    const args: any[] = [teamId];
    let sql = `SELECT m.content, m.timestamp, mem.name AS sender, c.name AS channel FROM messages m
      JOIN members mem ON mem.id = m.sender_id LEFT JOIN chat_channels c ON c.id = m.channel_id
      WHERE m.team_id = ? AND m.deleted_at IS NULL${w.sql}`;
    args.push(...w.args);
    if (q.channel) { sql += " AND LOWER(c.name) = ?"; args.push(q.channel.toLowerCase()); }
    if (q.person) { sql += " AND (LOWER(mem.name) = ? OR LOWER(mem.name) LIKE ? ESCAPE '\\')"; args.push(q.person.toLowerCase(), `${likeEsc(q.person.toLowerCase())} %`); }
    if (q.from) { sql += " AND m.timestamp >= ?"; args.push(utcFrom(q.from, tz)); }
    if (q.to) { sql += " AND m.timestamp < ?"; args.push(utcBefore(q.to, tz)); }
    sql += " ORDER BY m.id DESC LIMIT 61";
    const c = capped(await db(sql, ...args), 60);
    more = c.more;
    const rows = c.rows.reverse();
    for (const r of rows) lines.push(`[${when(Date.parse(r.timestamp), tz)}${r.channel ? ` · #${r.channel}` : ""}] ${r.sender}: ${clip(r.content, 300)}`);
  } else if (q.kind === "tasks") {
    const w = wordsWhere(q.query, ["t.title", "COALESCE(t.description, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT t.id, t.title, t.description, t.status, t.due_date, t.due_time, t.priority, t.created_at, t.completed_at,
      COALESCE((SELECT GROUP_CONCAT(mm.name, ', ') FROM task_assignees ta JOIN members mm ON mm.id = ta.member_id WHERE ta.task_id = t.id),
        (SELECT mm.name FROM members mm WHERE mm.id = t.assigned_to)) AS people
      FROM tasks t WHERE t.team_id = ?${w.sql}`;
    if (q.status === "open") sql += " AND t.status != 'done'";
    else if (["todo", "in-progress", "done"].includes(q.status || "")) { sql += " AND t.status = ?"; args.push(q.status); }
    if (q.person) {
      // Same rule as getTaskAssigneeIds: task_assignees rows, else the legacy
      // assigned_to (set when someone completes an unassigned task).
      const nameMatch = "(LOWER(mm.name) = ? OR LOWER(mm.name) LIKE ? ESCAPE '\\')";
      sql += ` AND (EXISTS (SELECT 1 FROM task_assignees ta JOIN members mm ON mm.id = ta.member_id WHERE ta.task_id = t.id AND ${nameMatch})
        OR (NOT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id) AND EXISTS (SELECT 1 FROM members mm WHERE mm.id = t.assigned_to AND ${nameMatch})))`;
      const p = q.person.toLowerCase();
      args.push(p, `${likeEsc(p)} %`, p, `${likeEsc(p)} %`);
    }
    // Finished tasks are dated by when they were finished (team-local day);
    // everything else by its due date, or the day it was made.
    const done = q.status === "done";
    if (done) {
      if (q.from) { sql += " AND t.completed_at >= ?"; args.push(utcFrom(q.from, tz)); }
      if (q.to) { sql += " AND t.completed_at < ?"; args.push(utcBefore(q.to, tz)); }
      sql += " ORDER BY t.completed_at DESC, t.id DESC LIMIT 41";
    } else {
      // Due dates are team-local days already; created_at is a UTC timestamp,
      // so an undated task is matched on the team-local day it was made.
      if (q.from) { sql += " AND ((t.due_date IS NOT NULL AND t.due_date >= ?) OR (t.due_date IS NULL AND t.created_at >= ?))"; args.push(q.from, utcFrom(q.from, tz)); }
      if (q.to) { sql += " AND ((t.due_date IS NOT NULL AND t.due_date <= ?) OR (t.due_date IS NULL AND t.created_at < ?))"; args.push(q.to, utcBefore(q.to, tz)); }
      sql += " ORDER BY COALESCE(t.due_date, '9999') ASC, t.id DESC LIMIT 41";
    }
    const c = capped(await db(sql, ...args), 40);
    more = c.more;
    for (const r of c.rows) {
      const finished = r.status === "done" && r.completed_at ? `, finished ${when(Date.parse(r.completed_at), tz)}` : "";
      lines.push(`#${r.id} ${clip(r.title, 120)} — ${r.status}${finished}${r.due_date ? `, due ${r.due_date}${r.due_time ? ` ${r.due_time}` : ""}` : ""}${r.priority ? `, ${r.priority} priority` : ""}${r.people ? `, assigned to ${r.people}` : ", unassigned"}${r.description ? ` — ${clip(r.description, 200)}` : ""}`);
    }
  } else if (q.kind === "events") {
    const w = wordsWhere(q.query, ["title", "COALESCE(description, '')", "COALESCE(location, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT id, title, description, date, start_time, end_time, location, event_type FROM events WHERE team_id = ?${w.sql}`;
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date <= ?"; args.push(q.to); }
    sql += " ORDER BY date ASC, start_time ASC LIMIT 61";
    const c = capped(await db(sql, ...args), 60);
    more = c.more;
    for (const r of c.rows) {
      lines.push(`#${r.id} ${r.date}${r.start_time ? ` ${r.start_time}${r.end_time ? `–${r.end_time}` : ""}` : " (all day)"} ${clip(r.title, 120)}${r.location ? ` @ ${clip(r.location, 60)}` : ""} [${r.event_type || "other"}]${r.description ? ` — ${clip(r.description, 200)}` : ""}`);
    }
  } else if (q.kind === "communications") {
    const w = wordsWhere(q.query, ["recipient", "subject", "body"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT id, recipient, subject, body, date, direction, parent_id FROM communications WHERE team_id = ?${w.sql}`;
    if (q.person) { sql += " AND LOWER(recipient) LIKE ? ESCAPE '\\'"; args.push(`%${likeEsc(q.person.toLowerCase())}%`); }
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    // Entries can carry a time ("2026-10-06 14:30"): bound by the next day, exclusive.
    if (q.to) { sql += " AND date < ?"; args.push(nextDay(q.to)); }
    sql += " ORDER BY date DESC, id DESC LIMIT 31";
    const c = capped(await db(sql, ...args), 30);
    more = c.more;
    for (const r of c.rows) {
      lines.push(`${r.date} ${r.direction === "inbound" ? "from" : "to"} ${clip(r.recipient, 60)}: "${clip(r.subject, 100)}" — ${clip(r.body, 240)}${r.parent_id ? " (reply in a thread)" : ""}`);
    }
  } else if (q.kind === "outreach") {
    const w = wordsWhere(q.query, ["title", "COALESCE(description, '')", "COALESCE(location, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT title, description, date, hours, location FROM outreach WHERE team_id = ?${w.sql}`;
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date < ?"; args.push(nextDay(q.to)); }
    sql += " ORDER BY date DESC LIMIT 41";
    const c = capped(await db(sql, ...args), 40);
    more = c.more;
    for (const r of c.rows) {
      lines.push(`${r.date} ${clip(r.title, 120)}${r.hours ? `, ${r.hours} h` : ""}${r.location ? ` @ ${clip(r.location, 60)}` : ""}${r.description ? ` — ${clip(r.description, 160)}` : ""}`);
    }
  } else if (q.kind === "budget") {
    const w = wordsWhere(q.query, ["COALESCE(description, '')", "COALESCE(category, '')"]);
    const args: any[] = [teamId, ...w.args];
    let where = `FROM budget WHERE team_id = ?${w.sql}`;
    if (q.from) { where += " AND date >= ?"; args.push(q.from); }
    if (q.to) { where += " AND date < ?"; args.push(nextDay(q.to)); }
    const c = capped(await db(`SELECT type, amount, category, description, date ${where} ORDER BY date DESC LIMIT 61`, ...args), 60);
    more = c.more;
    for (const r of c.rows) {
      const amt = Number(r.amount) || 0;
      lines.push(`${r.date || "no date"} ${r.type === "income" ? "+" : "-"}$${amt.toFixed(2)} ${clip(r.category, 40)}${r.description ? ` — ${clip(r.description, 120)}` : ""}`);
    }
    if (lines.length) {
      // Totals cover every matching entry, not just the rows listed.
      const [t] = await db(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'income' THEN 0 ELSE amount END), 0) AS spent ${where}`, ...args);
      summary = `Total of all ${Number(t?.n) || lines.length} matching entries: +$${(Number(t?.income) || 0).toFixed(2)} in, -$${(Number(t?.spent) || 0).toFixed(2)} out.`;
    }
  }
  return { lines, more, summary };
}

function describe(q: LookupQuery): string {
  const bits = [q.query && `"${q.query}"`, q.channel && `#${q.channel}`, q.person && `person ${q.person}`, q.status && `status ${q.status}`,
    q.from && q.to ? (q.from === q.to ? `on ${q.from}` : `${q.from} to ${q.to}`) : q.from ? `from ${q.from}` : q.to ? `until ${q.to}` : ""].filter(Boolean);
  return `${q.kind}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

/** Run the queries for one team and format the rows for the model (capped). */
export async function runLookups(db: DbAll, teamId: number, tz: string, queries: LookupQuery[]): Promise<string> {
  const parts: string[] = [];
  for (const q of queries.slice(0, MAX_LOOKUPS)) {
    let r: LookupRows;
    try { r = await runOne(db, teamId, tz, q); } catch (e) {
      console.error("Bruno lookup failed:", (e as any)?.message);
      // A failed search is not an empty one: say so, so Bruno never claims the records don't exist.
      parts.push(`Lookup: ${describe(q)} — SEARCH FAILED (a database error, not an empty result). Tell the user this search didn't work and to try again; don't say nothing exists.`);
      continue;
    }
    const { lines, more, summary } = r;
    const count = !lines.length ? "nothing found" : more ? `${lines.length} shown, MORE matched but are not listed (incomplete — say so, or suggest a narrower search)` : `${lines.length} found`;
    parts.push(`Lookup: ${describe(q)} — ${count}${lines.length ? `\n${lines.join("\n")}` : ""}${summary ? `\n${summary}` : ""}`);
  }
  const out = parts.join("\n\n");
  return out.length > 12000 ? `${out.slice(0, 12000)}\n… (more rows not shown — ask a narrower question)` : out;
}
