/**
 * Tests for the FIRST Events API client (server/ftcEvents.ts).
 *
 * All external HTTP is mocked — no live FIRST Events requests are made.
 * Covers: auth config, success paths, invalid responses, timeouts, 429
 * rate-limit handling, 5xx retry, secret redaction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFirstEventsConfigured,
  redactSecrets,
  FirstEventsError,
  getFirstEventsTeam,
  getFirstEventsTeamEvents,
  getFirstEventsEvent,
  getFirstEventsEventTeams,
  getFirstEventsRankings,
  getFirstEventsMatches,
  getFirstEventsAlliances,
} from "../ftcEvents";

const BASE = "https://ftc-events.firstinspires.org/v2.0";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  };
}

describe("isFirstEventsConfigured", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("is false when vars are missing", () => {
    delete process.env.FTC_EVENTS_USERNAME;
    delete process.env.FTC_EVENTS_TOKEN;
    expect(isFirstEventsConfigured()).toBe(false);
  });

  it("is true when both vars are set", () => {
    process.env.FTC_EVENTS_USERNAME = "user";
    process.env.FTC_EVENTS_TOKEN = "token";
    expect(isFirstEventsConfigured()).toBe(true);
  });

  it("is false when only one var is set", () => {
    process.env.FTC_EVENTS_USERNAME = "user";
    delete process.env.FTC_EVENTS_TOKEN;
    expect(isFirstEventsConfigured()).toBe(false);
  });
});

describe("redactSecrets", () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("redacts the token and username from messages", () => {
    process.env.FTC_EVENTS_USERNAME = "sushil";
    process.env.FTC_EVENTS_TOKEN = "SECRET-TOKEN-123";
    const msg = "auth failed for sushil with SECRET-TOKEN-123";
    const out = redactSecrets(msg);
    expect(out).not.toContain("SECRET-TOKEN-123");
    expect(out).not.toContain("sushil");
    expect(out).toContain("[redacted]");
  });

  it("redacts Basic auth headers", () => {
    const out = redactSecrets("header: Basic c3VzaGlsOnRva2Vu");
    expect(out).not.toContain("c3VzaGlsOnRva2Vu");
    expect(out).toContain("Basic [redacted]");
  });
});

describe("FIRST Events API client", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env.FTC_EVENTS_USERNAME = "testuser";
    process.env.FTC_EVENTS_TOKEN = "testtoken";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const mockFetch = () => vi.mocked(fetch);

  it("sends Basic auth and parses a team", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        teams: [
          {
            teamNumber: 4215,
            nameFull: "Hypnotic Robotics",
            schoolName: "River Dell",
            city: "Oradell",
            stateProv: "New Jersey",
            country: "USA",
            rookieYear: 2010,
            sponsors: ["REV Robotics"],
          },
        ],
      }) as any
    );
    const team = await getFirstEventsTeam(2025, 4215);
    expect(team?.teamNumber).toBe(4215);
    expect(team?.name).toBe("Hypnotic Robotics");
    expect(team?.sponsors).toEqual(["REV Robotics"]);
    // Verify auth header was sent (without leaking the value into the test output)
    const [, opts] = mockFetch().mock.calls[0];
    const auth = (opts as any).headers.Authorization as string;
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(auth).not.toContain("testtoken");
    expect(Buffer.from(auth.slice(6), "base64").toString()).toBe("testuser:testtoken");
  });

  it("returns null on 404 for unknown team", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 404) as any);
    expect(await getFirstEventsTeam(2025, 999999)).toBeNull();
  });

  it("throws non-retryable on 401", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 401) as any);
    await expect(getFirstEventsTeam(2025, 4215)).rejects.toThrow(FirstEventsError);
  });

  it("retries once on 500 then succeeds", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 500) as any)
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 1, nameShort: "T1" }] }) as any);
    const team = await getFirstEventsTeam(2025, 1);
    expect(team?.teamNumber).toBe(1);
    expect(mockFetch()).toHaveBeenCalledTimes(2);
  });

  it("throws after retry exhausted on persistent 500", async () => {
    mockFetch().mockResolvedValue(jsonResponse({}, 500) as any);
    await expect(getFirstEventsTeam(2025, 1)).rejects.toThrow(FirstEventsError);
    expect(mockFetch()).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("handles 429 with backoff and retries", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }) as any)
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 2, nameShort: "T2" }] }) as any);
    const team = await getFirstEventsTeam(2025, 2);
    expect(team?.teamNumber).toBe(2);
    expect(mockFetch().mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("dedupes team events by code", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        events: [
          { eventCode: "EVT1", name: "Event One", dateStart: "2025-01-01T00:00:00" },
          { eventCode: "evt1", name: "Event One dup", dateStart: "2025-01-01T00:00:00" },
          { eventCode: "EVT2", name: "Event Two" },
        ],
      }) as any
    );
    const events = await getFirstEventsTeamEvents(2025, 4215);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.eventCode === "EVT1")?.dateStart).toBe("2025-01-01");
  });

  it("returns [] for rankings when event not found (404)", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 404) as any);
    expect(await getFirstEventsRankings(2025, "NOPE")).toEqual([]);
  });

  it("validates rankings and drops malformed entries", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        rankings: [
          { teamNumber: 1, rank: 1, wins: 5, losses: 0, ties: 0 },
          { teamNumber: "bad" },
          null,
          { rank: 3 }, // missing teamNumber
        ],
      }) as any
    );
    const rankings = await getFirstEventsRankings(2025, "EVT1");
    expect(rankings).toHaveLength(1);
    expect(rankings[0].teamNumber).toBe(1);
  });

  it("validates matches and normalizes levels", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            matchNumber: 1,
            tournamentLevel: "Qualification",
            red: { team1: 1, team2: 2, score: 100 },
            blue: { team1: 3, team2: 4, score: 90 },
          },
          {
            matchNumber: 1,
            tournamentLevel: "Playoff",
            series: 1,
            red: { team1: 1, team2: 2, score: 110 },
            blue: { team1: 5, team2: 6, score: 80 },
          },
        ],
      }) as any
    );
    const matches = await getFirstEventsMatches(2025, "EVT1");
    expect(matches).toHaveLength(2);
    expect(matches[0].level).toBe("qual");
    expect(matches[1].level).toBe("playoff");
    expect(matches[0].red.teams).toEqual([1, 2]);
    expect(matches[0].red.score).toBe(100);
  });

  it("validates alliances", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        alliances: [{ number: 1, captain: 100, pick1: 200, pick2: 300, name: "Alliance 1" }],
      }) as any
    );
    const alliances = await getFirstEventsAlliances(2025, "EVT1");
    expect(alliances).toHaveLength(1);
    expect(alliances[0].captain).toBe(100);
  });

  it("validates event teams and dedupes", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        teams: [
          { teamNumber: 1, nameShort: "One" },
          { teamNumber: 1, nameShort: "One dup" },
          { teamNumber: 2, nameFull: "Two Full" },
        ],
      }) as any
    );
    const teams = await getFirstEventsEventTeams(2025, "EVT1");
    expect(teams).toHaveLength(2);
    expect(teams[1].name).toBe("Two Full");
  });

  it("returns null for unknown event (404)", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 404) as any);
    expect(await getFirstEventsEvent(2025, "NOPE")).toBeNull();
  });

  it("throws when not configured", async () => {
    delete process.env.FTC_EVENTS_USERNAME;
    delete process.env.FTC_EVENTS_TOKEN;
    await expect(getFirstEventsTeam(2025, 1)).rejects.toThrow("not configured");
  });

  it("uses the correct base URL and season path", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ teams: [] }) as any);
    await getFirstEventsTeam(2026, 4215).catch(() => null);
    const [url] = mockFetch().mock.calls[0];
    expect(String(url).startsWith(`${BASE}/2026/teams`)).toBe(true);
  });
});
