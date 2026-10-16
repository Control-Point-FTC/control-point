/**
 * Feature parity, Phase 2.1: the New Event dialog. Outreach and Scrimmage
 * types, an agenda separate from the notes (in exports and Bruno's lookup),
 * multi-day events (one event per day, with its own times), and Bruno's event
 * card carrying type, location and agenda.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestServer, seedTeam, seedMember, type TestServer } from "./helpers/testServer";
import { runLookups } from "../brunoLookup";
import { buildIcs } from "../ics";
import { googleEventBody } from "../googleCalendar";
import { cleanEventType, eventExportNotes, locationHref } from "../../src/types/eventTypes";

vi.setConfig({ testTimeout: 30_000 });

describe("shared helpers", () => {
  it("types, export notes and location links", () => {
    expect(cleanEventType("Outreach")).toBe("outreach");
    expect(cleanEventType("party")).toBeNull();
    expect(eventExportNotes({ agenda: "Drive practice\nIntake review", description: "Bring batteries" })).toBe("Agenda:\nDrive practice\nIntake review\n\nBring batteries");
    expect(locationHref("Join: https://meet.google.com/abc-defg-hij")).toEqual({ kind: "link", href: "https://meet.google.com/abc-defg-hij" });
    expect(locationHref("Room 101, Main St")?.kind).toBe("place");
    expect(locationHref("javascript:alert(1)")?.kind).toBe("place");
    expect(locationHref("  ")).toBeNull();
    // Punctuation around a link isn't part of it; brackets that belong to the URL stay.
    expect(locationHref("Join (https://meet.google.com/abc-defg-hij).")?.href).toBe("https://meet.google.com/abc-defg-hij");
    expect(locationHref("See https://en.wikipedia.org/wiki/Gear_(device), then")?.href).toBe("https://en.wikipedia.org/wiki/Gear_(device)");
  });
  it("calendar exports carry the agenda", () => {
    const ev = { id: 1, title: "Practice", date: "2099-03-01", start_time: "16:00", end_time: "18:00", description: "Bring batteries", agenda: "Drive practice" };
    // Long lines are folded (CRLF + space); unfold before reading.
    const ics = buildIcs({ calendarName: "Robo", timeZone: "UTC", host: "x", events: [ev], now: 0 }).replace(/\r\n /g, "");
    expect(ics).toContain("DESCRIPTION:Agenda:\\nDrive practice\\n\\nBring batteries");
    expect(googleEventBody(ev, "UTC").description).toMatch(/^Agenda:\nDrive practice\n\nBring batteries/);
  });
});

let t: TestServer;
let team = 0;
let admin = "";
const rows = async (sql: string, ...args: any[]) => (await t.db.execute({ sql, args })).rows as any[];

beforeAll(async () => {
  t = await startTestServer("cp-eventdlg-");
  team = await seedTeam(t.db, "Robo");
  admin = await t.session(await seedMember(t.db, team, "Ada", "ada@ev.test", "admin"));
}, 120_000);
afterAll(async () => { await t?.stop(); });

describe("events", () => {
  it("saves the agenda and new types; unknown types are refused; edits change the agenda", async () => {
    const r = await t.post("/api/events", { title: "Library demo", date: "2099-02-01", start_time: "16:00", event_type: "outreach", agenda: "  Set up\nDemo\n", location: "https://meet.google.com/x" }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [row] = await rows("SELECT event_type, agenda FROM events WHERE id = ?", r.body.id);
    expect(row).toMatchObject({ event_type: "outreach", agenda: "Set up\nDemo" });
    expect((await t.post("/api/events", { title: "Party", date: "2099-02-02", event_type: "party" }, admin)).status).toBe(400);
    expect((await t.patch(`/api/events/${r.body.id}`, { agenda: "Set up\nDemo\nPack up", event_type: "scrimmage" }, admin)).status).toBe(200);
    expect((await rows("SELECT event_type, agenda FROM events WHERE id = ?", r.body.id))[0]).toMatchObject({ event_type: "scrimmage", agenda: "Set up\nDemo\nPack up" });
    expect((await t.patch(`/api/events/${r.body.id}`, { event_type: "party" }, admin)).status).toBe(400);
    // Bruno's lookup shows the agenda.
    const out = await runLookups(((sql: string, ...a: any[]) => rows(sql, ...a)) as any, team, "UTC", [{ kind: "events", query: "Library" } as any]);
    expect(out).toMatch(/agenda: Set up; Demo; Pack up/);
  });

  it("a multi-day event is one event per day, each with its own times, in one go", async () => {
    const r = await t.post("/api/events", {
      title: "Regional", date: "2099-04-10", start_time: "08:00", end_time: "17:00", event_type: "competition",
      extra_days: [{ date: "2099-04-11", start_time: "09:00", end_time: "15:00" }],
    }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.count).toBe(2);
    const days = await rows("SELECT date, start_time, end_time, series_id FROM events WHERE title = 'Regional' ORDER BY date");
    expect(days.map((d) => [d.date, d.start_time, d.end_time])).toEqual([["2099-04-10", "08:00", "17:00"], ["2099-04-11", "09:00", "15:00"]]);
    expect(days.every((d) => d.series_id == null)).toBe(true);
    // Not with a repeat; a bad or repeated day refuses the whole thing.
    expect((await t.post("/api/events", { title: "X", date: "2099-04-12", repeat: { freq: "weekly", interval: 1, count: 2 }, extra_days: [{ date: "2099-04-13" }] }, admin)).status).toBe(400);
    expect((await t.post("/api/events", { title: "Y", date: "2099-04-12", extra_days: [{ date: "2099-04-12" }] }, admin)).status).toBe(400);
    expect((await t.post("/api/events", { title: "Z", date: "2099-04-12", extra_days: [{ date: "2099-04-13", start_time: "10:00", end_time: "09:00" }] }, admin)).status).toBe(400);
    expect(await rows("SELECT id FROM events WHERE title IN ('X', 'Y', 'Z')")).toHaveLength(0);
  });

  it("Bruno's event card carries type, location and agenda; an unknown type falls back to meeting", async () => {
    const r = await t.post("/api/ai/apply-actions", { actions: [{ kind: "event", items: [
      { title: "Scrimmage at Lincoln", date: "2099-05-02", time: "09:00", type: "scrimmage", location: "Lincoln HS gym", agenda: "Inspection\nMatches" },
      { title: "Odd one", date: "2099-05-03", type: "party" },
    ] }] }, admin);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await rows("SELECT event_type, location, agenda FROM events WHERE title = 'Scrimmage at Lincoln'"))[0]).toMatchObject({ event_type: "scrimmage", location: "Lincoln HS gym", agenda: "Inspection\nMatches" });
    expect((await rows("SELECT event_type FROM events WHERE title = 'Odd one'"))[0].event_type).toBe("meeting");
  });
});
