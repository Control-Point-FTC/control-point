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

function when(ms: number, tz: string) {
  return new Date(ms).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function runOne(db: DbAll, teamId: number, tz: string, q: LookupQuery): Promise<string[]> {
  const lines: string[] = [];
  if (q.kind === "messages") {
    const w = wordsWhere(q.query, ["m.content"]);
    const args: any[] = [teamId];
    let sql = `SELECT m.content, m.timestamp, mem.name AS sender, c.name AS channel FROM messages m
      JOIN members mem ON mem.id = m.sender_id LEFT JOIN chat_channels c ON c.id = m.channel_id
      WHERE m.team_id = ? AND m.deleted_at IS NULL${w.sql}`;
    args.push(...w.args);
    if (q.channel) { sql += " AND LOWER(c.name) = ?"; args.push(q.channel.toLowerCase()); }
    if (q.person) { sql += " AND (LOWER(mem.name) = ? OR LOWER(mem.name) LIKE ? ESCAPE '\\')"; args.push(q.person.toLowerCase(), `${likeEsc(q.person.toLowerCase())} %`); }
    if (q.from) { sql += " AND m.timestamp >= ?"; args.push(new Date(zonedMidnightMs(q.from, tz)).toISOString()); }
    if (q.to) { sql += " AND m.timestamp < ?"; args.push(new Date(zonedMidnightMs(nextDay(q.to), tz)).toISOString()); }
    sql += " ORDER BY m.id DESC LIMIT 60";
    const rows = (await db(sql, ...args)).reverse();
    for (const r of rows) lines.push(`[${when(Date.parse(r.timestamp), tz)}${r.channel ? ` · #${r.channel}` : ""}] ${r.sender}: ${clip(r.content, 300)}`);
  } else if (q.kind === "tasks") {
    const w = wordsWhere(q.query, ["t.title", "COALESCE(t.description, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT t.id, t.title, t.status, t.due_date, t.due_time, t.priority, t.created_at,
      (SELECT GROUP_CONCAT(mm.name, ', ') FROM task_assignees ta JOIN members mm ON mm.id = ta.member_id WHERE ta.task_id = t.id) AS people
      FROM tasks t WHERE t.team_id = ?${w.sql}`;
    if (q.status === "open") sql += " AND t.status != 'done'";
    else if (["todo", "in-progress", "done"].includes(q.status || "")) { sql += " AND t.status = ?"; args.push(q.status); }
    if (q.person) {
      sql += ` AND EXISTS (SELECT 1 FROM task_assignees ta JOIN members mm ON mm.id = ta.member_id WHERE ta.task_id = t.id AND (LOWER(mm.name) = ? OR LOWER(mm.name) LIKE ? ESCAPE '\\'))`;
      args.push(q.person.toLowerCase(), `${likeEsc(q.person.toLowerCase())} %`);
    }
    if (q.from) { sql += " AND COALESCE(t.due_date, substr(t.created_at, 1, 10)) >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND COALESCE(t.due_date, substr(t.created_at, 1, 10)) <= ?"; args.push(q.to); }
    sql += " ORDER BY COALESCE(t.due_date, '9999') ASC, t.id DESC LIMIT 40";
    for (const r of await db(sql, ...args)) {
      lines.push(`#${r.id} ${clip(r.title, 120)} — ${r.status}${r.due_date ? `, due ${r.due_date}${r.due_time ? ` ${r.due_time}` : ""}` : ""}${r.priority ? `, ${r.priority} priority` : ""}${r.people ? `, assigned to ${r.people}` : ", unassigned"}`);
    }
  } else if (q.kind === "events") {
    const w = wordsWhere(q.query, ["title", "COALESCE(description, '')", "COALESCE(location, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT id, title, date, start_time, end_time, location, event_type FROM events WHERE team_id = ?${w.sql}`;
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date <= ?"; args.push(q.to); }
    sql += " ORDER BY date ASC, start_time ASC LIMIT 60";
    for (const r of await db(sql, ...args)) {
      lines.push(`#${r.id} ${r.date}${r.start_time ? ` ${r.start_time}${r.end_time ? `–${r.end_time}` : ""}` : " (all day)"} ${clip(r.title, 120)}${r.location ? ` @ ${clip(r.location, 60)}` : ""} [${r.event_type || "other"}]`);
    }
  } else if (q.kind === "communications") {
    const w = wordsWhere(q.query, ["recipient", "subject", "body"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT id, recipient, subject, body, date, direction, parent_id FROM communications WHERE team_id = ?${w.sql}`;
    if (q.person) { sql += " AND LOWER(recipient) LIKE ? ESCAPE '\\'"; args.push(`%${likeEsc(q.person.toLowerCase())}%`); }
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date <= ?"; args.push(q.to); }
    sql += " ORDER BY date DESC, id DESC LIMIT 30";
    for (const r of await db(sql, ...args)) {
      lines.push(`${r.date} ${r.direction === "inbound" ? "from" : "to"} ${clip(r.recipient, 60)}: "${clip(r.subject, 100)}" — ${clip(r.body, 240)}${r.parent_id ? " (reply in a thread)" : ""}`);
    }
  } else if (q.kind === "outreach") {
    const w = wordsWhere(q.query, ["title", "COALESCE(description, '')", "COALESCE(location, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT title, description, date, hours, location FROM outreach WHERE team_id = ?${w.sql}`;
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date <= ?"; args.push(q.to); }
    sql += " ORDER BY date DESC LIMIT 40";
    for (const r of await db(sql, ...args)) {
      lines.push(`${r.date} ${clip(r.title, 120)}${r.hours ? `, ${r.hours} h` : ""}${r.location ? ` @ ${clip(r.location, 60)}` : ""}${r.description ? ` — ${clip(r.description, 160)}` : ""}`);
    }
  } else if (q.kind === "budget") {
    const w = wordsWhere(q.query, ["COALESCE(description, '')", "COALESCE(category, '')"]);
    const args: any[] = [teamId, ...w.args];
    let sql = `SELECT type, amount, category, description, date FROM budget WHERE team_id = ?${w.sql}`;
    if (q.from) { sql += " AND date >= ?"; args.push(q.from); }
    if (q.to) { sql += " AND date <= ?"; args.push(q.to); }
    sql += " ORDER BY date DESC LIMIT 60";
    let income = 0;
    let spent = 0;
    for (const r of await db(sql, ...args)) {
      const amt = Number(r.amount) || 0;
      if (r.type === "income") income += amt; else spent += amt;
      lines.push(`${r.date || "no date"} ${r.type === "income" ? "+" : "-"}$${amt.toFixed(2)} ${clip(r.category, 40)}${r.description ? ` — ${clip(r.description, 120)}` : ""}`);
    }
    if (lines.length) lines.push(`Total of these rows: +$${income.toFixed(2)} in, -$${spent.toFixed(2)} out.`);
  }
  return lines;
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
    let lines: string[];
    try { lines = await runOne(db, teamId, tz, q); } catch (e) { console.error("Bruno lookup failed:", (e as any)?.message); lines = []; }
    parts.push(`Lookup: ${describe(q)} — ${lines.length ? `${lines.length} found` : "nothing found"}${lines.length ? `\n${lines.join("\n")}` : ""}`);
  }
  const out = parts.join("\n\n");
  return out.length > 12000 ? `${out.slice(0, 12000)}\n… (more rows not shown — ask a narrower question)` : out;
}
