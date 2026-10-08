/**
 * Bruno lookups (phase 4b): the ```lookup block is parsed and never shown,
 * and each query reads only the asking team's rows (deleted messages never).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { extractLookupBlocks, createLookupHold, runLookups, zonedMidnightMs } from "../brunoLookup";

describe("lookup blocks", () => {
  it("parses up to 3 queries and strips the block (even an unfinished one)", () => {
    const r = extractLookupBlocks('Checking…\n```lookup\n[{"kind":"messages","channel":"#General","person":"@Arnav","from":"2026-10-06","to":"2026-10-06"},{"kind":"tasks","status":"DONE"},{"kind":"nope"},{"kind":"events"},{"kind":"budget"}]\n```');
    expect(r.text).toBe("Checking…");
    expect(r.queries).toEqual([
      { kind: "messages", channel: "General", person: "Arnav", from: "2026-10-06", to: "2026-10-06" },
      { kind: "tasks", status: "done" },
      { kind: "events" },
    ]);
    expect(extractLookupBlocks("Hi\n```lookup\n{\"kind\":\"mess").text).toBe("Hi");
    expect(extractLookupBlocks("no block").queries).toEqual([]);
  });

  it("the stream filter never lets the block through, even split across chunks", () => {
    const text = "Let me check.\n```lookup\n{\"kind\":\"tasks\"}\n```";
    for (const size of [1, 2, 3, 5, 9, 40]) {
      const hold = createLookupHold();
      let out = "";
      for (let i = 0; i < text.length; i += size) out += hold.push(text.slice(i, i + size));
      out += hold.end();
      expect(out, `chunk ${size}`).toBe("Let me check.\n");
      expect(hold.blocked).toBe(true);
    }
    const plain = createLookupHold();
    expect(plain.push("Code: ``") + plain.push("`js\nx\n```") + plain.end()).toBe("Code: ```js\nx\n```");
    expect(plain.blocked).toBe(false);
  });

  it("day boundaries are in the team's timezone", () => {
    expect(new Date(zonedMidnightMs("2026-10-06", "America/New_York")).toISOString()).toBe("2026-10-06T04:00:00.000Z");
  });
});

describe("runLookups", () => {
  const db = createClient({ url: ":memory:" });
  const dbAll = async (sql: string, ...args: any[]) => (await db.execute({ sql, args })).rows as any[];
  beforeAll(async () => {
    await db.executeMultiple(`
      CREATE TABLE members (id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT);
      CREATE TABLE chat_channels (id INTEGER PRIMARY KEY, team_id INTEGER, name TEXT);
      CREATE TABLE messages (id INTEGER PRIMARY KEY, team_id INTEGER, sender_id INTEGER, content TEXT, timestamp TEXT, channel_id INTEGER, deleted_at TEXT);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY, team_id INTEGER, title TEXT, description TEXT, status TEXT, due_date TEXT, due_time TEXT, priority TEXT, created_at TEXT, completed_at TEXT);
      CREATE TABLE task_assignees (task_id INTEGER, member_id INTEGER);
      CREATE TABLE events (id INTEGER PRIMARY KEY, team_id INTEGER, title TEXT, description TEXT, date TEXT, start_time TEXT, end_time TEXT, location TEXT, event_type TEXT);
      CREATE TABLE communications (id INTEGER PRIMARY KEY, team_id INTEGER, recipient TEXT, subject TEXT, body TEXT, date TEXT, direction TEXT, parent_id INTEGER);
      CREATE TABLE outreach (id INTEGER PRIMARY KEY, team_id INTEGER, title TEXT, description TEXT, date TEXT, hours INTEGER, location TEXT);
      CREATE TABLE budget (id INTEGER PRIMARY KEY, team_id INTEGER, type TEXT, amount REAL, category TEXT, description TEXT, date TEXT);
      INSERT INTO members VALUES (1, 1, 'Arnav Patel'), (2, 1, 'Ada Lovelace'), (3, 2, 'Arnav Other');
      INSERT INTO chat_channels VALUES (10, 1, 'general'), (11, 1, 'build'), (12, 2, 'general');
      INSERT INTO messages VALUES
        (1, 1, 1, 'Intake prototype is done, testing tomorrow', '2026-10-06T19:30:00Z', 10, NULL),
        (2, 1, 1, 'deleted thing', '2026-10-06T20:00:00Z', 10, '2026-10-06T21:00:00Z'),
        (3, 1, 2, 'Ada in build', '2026-10-06T19:00:00Z', 11, NULL),
        (4, 1, 1, 'Late night (Oct 7 in New York)', '2026-10-07T05:00:00Z', 10, NULL),
        (5, 2, 3, 'Other team secret', '2026-10-06T19:00:00Z', 12, NULL);
      INSERT INTO tasks VALUES (1, 1, 'Order wheels', '', 'done', '2026-10-05', NULL, 'high', '2026-10-01', '2026-10-05T15:00:00Z'), (2, 1, 'Fix lift', 'It slips', 'todo', '2026-10-09', '18:00', NULL, '2026-10-02', NULL), (3, 2, 'Other team task', '', 'done', '2026-10-05', NULL, NULL, '2026-10-01', '2026-10-05T15:00:00Z'),
        (4, 1, 'Tune PID', '', 'done', '2026-09-01', NULL, NULL, '2026-08-20', '2026-10-06T14:00:00Z');
      INSERT INTO task_assignees VALUES (1, 1), (2, 2);
      INSERT INTO events VALUES (1, 1, 'Qualifier', '', '2026-12-12', '', '', 'Gym', 'competition'), (2, 2, 'Other event', '', '2026-12-12', '', '', '', 'meeting');
      INSERT INTO communications VALUES (1, 1, 'REV Robotics', 'Wheel order', 'Asked about lead times', '2026-10-03', 'outbound', NULL);
      INSERT INTO budget VALUES (1, 1, 'expense', 60, 'Wheels', 'Mecanum wheels', '2026-10-03'), (2, 1, 'income', 500, 'Sponsor', 'Acme', '2026-10-04');
      ALTER TABLE tasks ADD COLUMN assigned_to INTEGER;
    `);
  });

  it("finds what Arnav said in #general on October 6 (team-local day), skipping deleted messages", async () => {
    const out = await runLookups(dbAll, 1, "America/New_York", [{ kind: "messages", channel: "general", person: "Arnav", from: "2026-10-06", to: "2026-10-06" }]);
    expect(out).toContain("1 found");
    expect(out).toContain("Arnav Patel: Intake prototype is done, testing tomorrow");
    expect(out).not.toContain("deleted thing");
    expect(out).not.toContain("Late night");
    expect(out).not.toContain("Other team");
  });

  it("tasks by status and assignee; events, communications, budget; never another team's", async () => {
    const done = await runLookups(dbAll, 1, "America/New_York", [{ kind: "tasks", status: "done" }]);
    expect(done).toContain("#1 Order wheels — done, finished Oct 5, 2026, 11:00 AM, due 2026-10-05, high priority, assigned to Arnav Patel");
    expect(done).not.toContain("Other team task");
    expect(await runLookups(dbAll, 1, "UTC", [{ kind: "tasks", person: "Ada", query: "lift" }])).toContain("Fix lift — todo, due 2026-10-09 18:00");
    const mix = await runLookups(dbAll, 1, "UTC", [{ kind: "events", from: "2026-12-01" }, { kind: "communications", person: "rev" }, { kind: "budget" }]);
    expect(mix).toContain("2026-12-12 (all day) Qualifier @ Gym [competition]");
    expect(mix).not.toContain("Other event");
    expect(mix).toContain('to REV Robotics: "Wheel order"');
    expect(mix).toContain("Total of all 2 matching entries: +$500.00 in, -$60.00 out.");
  });

  it("says plainly when nothing matches; LIKE wildcards are literal", async () => {
    expect(await runLookups(dbAll, 1, "UTC", [{ kind: "messages", query: "100%_done" }])).toBe('Lookup: messages ("100%_done") — nothing found');
  });

  it("finished tasks are dated by when they were finished, team-local", async () => {
    const out = await runLookups(dbAll, 1, "America/New_York", [{ kind: "tasks", status: "done", from: "2026-10-06", to: "2026-10-06" }]);
    expect(out).toContain("Tune PID — done, finished Oct 6, 2026");
    expect(out).not.toContain("Order wheels");
  });

  it("task and event descriptions come back", async () => {
    expect(await runLookups(dbAll, 1, "UTC", [{ kind: "tasks", query: "lift" }])).toContain("— It slips");
  });

  it("flags rows past the limit and totals the budget over every match", async () => {
    const big = createClient({ url: ":memory:" });
    const bigAll = async (sql: string, ...args: any[]) => (await big.execute({ sql, args })).rows as any[];
    await big.execute("CREATE TABLE budget (id INTEGER PRIMARY KEY, team_id INTEGER, type TEXT, amount REAL, category TEXT, description TEXT, date TEXT)");
    for (let i = 0; i < 61; i++) await big.execute({ sql: "INSERT INTO budget (team_id, type, amount, category, date) VALUES (1, 'expense', 1, 'Parts', '2026-10-01')", args: [] });
    const out = await runLookups(bigAll, 1, "UTC", [{ kind: "budget" }]);
    expect(out).toContain("60 shown, MORE matched");
    expect(out).toContain("Total of all 61 matching entries: +$0.00 in, -$61.00 out.");
  });

  it("a failed search says it failed, not that nothing exists", async () => {
    const broken = async () => { throw new Error("no such table"); };
    const out = await runLookups(broken, 1, "UTC", [{ kind: "outreach" }]);
    expect(out).toContain("SEARCH FAILED");
    expect(out).not.toContain("nothing found");
  });

  it("a timed communication on the last day of the range is found", async () => {
    await db.execute("INSERT INTO communications VALUES (2, 1, 'goBILDA', 'Quote', 'Asked for a quote', '2026-10-06 14:30', 'outbound', NULL)");
    const out = await runLookups(dbAll, 1, "UTC", [{ kind: "communications", from: "2026-10-06", to: "2026-10-06" }]);
    expect(out).toContain('to goBILDA: "Quote"');
  });

  it("a task with only the legacy assigned_to is found by person and named", async () => {
    await db.execute("INSERT INTO tasks (id, team_id, title, status, assigned_to, created_at) VALUES (5, 1, 'Sweep the shop', 'done', 2, '2026-10-01')");
    const out = await runLookups(dbAll, 1, "UTC", [{ kind: "tasks", person: "Ada", query: "sweep" }]);
    expect(out).toContain("Sweep the shop — done");
    expect(out).toContain("assigned to Ada Lovelace");
  });

  it("an undated task is matched on the team-local day it was made", async () => {
    await db.execute("INSERT INTO tasks (id, team_id, title, status, created_at) VALUES (6, 1, 'Late-night idea', 'todo', '2026-10-07T02:00:00.000Z')");
    const ny = await runLookups(dbAll, 1, "America/New_York", [{ kind: "tasks", from: "2026-10-06", to: "2026-10-06" }]);
    expect(ny).toContain("Late-night idea");
    const utc = await runLookups(dbAll, 1, "UTC", [{ kind: "tasks", from: "2026-10-06", to: "2026-10-06" }]);
    expect(utc).not.toContain("Late-night idea");
  });
});
