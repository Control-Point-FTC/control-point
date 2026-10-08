import { describe, it, expect } from "vitest";
import { buildIcs, icsEscape, icsFold } from "../ics";

describe("ics", () => {
  it("escapes text values", () => {
    expect(icsEscape("a,b;c\\d\nnext")).toBe("a\\,b\\;c\\\\d\\nnext");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "DESCRIPTION:" + "é".repeat(80);
    const folded = icsFold(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });

  it("writes timed events in UTC and all-day events as dates, with alarms", () => {
    const ics = buildIcs({
      calendarName: "Robo · Control Point", timeZone: "America/New_York", host: "tryctrlpoint.org", now: Date.UTC(2026, 9, 8),
      events: [
        { id: 1, title: "Build session", date: "2026-10-10", start_time: "18:00", end_time: "20:30", location: "Shop, Room 2", reminder_minutes: 30 },
        { id: 2, title: "Qualifier", date: "2026-12-12", start_time: "", end_time: "", reminder_minutes: 1440 },
        { id: 3, title: "No end", date: "2026-10-11", start_time: "09:00" },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:event-1@tryctrlpoint.org");
    expect(ics).toContain("DTSTART:20261010T220000Z");
    expect(ics).toContain("DTEND:20261011T003000Z");
    expect(ics).toContain("LOCATION:Shop\\, Room 2");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261212");
    expect(ics).toContain("DTEND;VALUE=DATE:20261213");
    // 9am EST on Dec 11 = 14:00Z.
    expect(ics).toContain("TRIGGER;VALUE=DATE-TIME:20261211T140000Z");
    expect(ics).toContain("DTSTART:20261011T130000Z");
    expect(ics).toContain("DTEND:20261011T140000Z");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});
