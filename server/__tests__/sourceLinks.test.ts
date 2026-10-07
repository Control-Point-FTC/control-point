import { describe, it, expect } from "vitest";
import { cite, eventUrl, siteOf, teamUrl } from "../sourceLinks";

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
});
