import { describe, it, expect } from "vitest";
import { cite, citeEvent, citeTeam, eventUrl, siteOf, teamUrl } from "../sourceLinks";

describe("source links (Bruno citations)", () => {
  it("picks the site the numbers came from, including a cache's origin", () => {
    expect(siteOf("first-events")).toBe("first-events");
    expect(siteOf("ftc-scout")).toBe("ftc-scout");
    expect(siteOf("cache", "first-events")).toBe("first-events");
    expect(siteOf("cache", "ftc-scout")).toBe("ftc-scout");
    expect(siteOf(undefined)).toBe("ftc-scout");
  });
  it("builds each site's public team and event pages", () => {
    expect(teamUrl("first-events", 2025, 4215)).toBe("https://ftc-events.firstinspires.org/2025/team/4215");
    expect(teamUrl("ftc-scout", 2025, 4215)).toBe("https://ftcscout.org/teams/4215?season=2025");
    expect(eventUrl("first-events", 2025, "USNJCMP")).toBe("https://ftc-events.firstinspires.org/2025/USNJCMP");
    expect(eventUrl("ftc-scout", 2025, "USNJ CMP")).toBe("https://ftcscout.org/events/2025/USNJ%20CMP");
    expect(cite("ftc-scout", "https://ftcscout.org/teams/1")).toBe("[FTC Scout](https://ftcscout.org/teams/1)");
  });

  it("credits each stat to the site that supplied it (FIRST Events has no OPR)", () => {
    expect(citeTeam("first-events", 2025, 4215, true)).toBe("records: [FIRST Events](https://ftc-events.firstinspires.org/2025/team/4215); OPR: [FTC Scout](https://ftcscout.org/teams/4215?season=2025)");
    expect(citeTeam("first-events", 2025, 4215, false)).toBe("[FIRST Events](https://ftc-events.firstinspires.org/2025/team/4215)");
    expect(citeTeam("ftc-scout", 2025, 4215, true)).toBe("[FTC Scout](https://ftcscout.org/teams/4215?season=2025)");
    expect(citeEvent("first-events", 2025, "X", true)).toBe("standings: [FIRST Events](https://ftc-events.firstinspires.org/2025/X); OPR and scores: [FTC Scout](https://ftcscout.org/events/2025/X)");
    expect(citeEvent("ftc-scout", 2025, "X", true)).toBe("[FTC Scout](https://ftcscout.org/events/2025/X)");
  });
});
