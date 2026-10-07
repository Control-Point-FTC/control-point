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
  getFirstEventsSchedule,
  matchKey,
} from "../ftcEvents";

const BASE = "https://ftc-api.firstinspires.org/v2.0";

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

// Fixtures follow the official FTC Events API v2.0 contract
// (ftc-api.firstinspires.org/swagger/v2.0/swagger.json).
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
    vi.useRealTimers();
  });

  const mockFetch = () => vi.mocked(fetch);
  const calledUrl = (i = 0) => String(mockFetch().mock.calls[i][0]);

  it("sends Basic auth to the API host and parses SeasonTeamModel", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        teams: [
          {
            teamNumber: 4215,
            nameShort: "Hypnotic Robotics",
            nameFull: "REV Robotics/Gene Haas Foundation&River Dell Regional High Sch",
            schoolName: "River Dell Regional High Sch",
            city: "Oradell",
            stateProv: "New Jersey",
            country: "USA",
            rookieYear: 2010,
          },
        ],
        teamCountTotal: 1,
        pageCurrent: 1,
        pageTotal: 1,
      }) as any
    );
    const team = await getFirstEventsTeam(2025, 4215);
    expect(calledUrl()).toBe(`${BASE}/2025/teams?teamNumber=4215`);
    expect(team?.name).toBe("Hypnotic Robotics");
    expect(team?.state).toBe("New Jersey");
    expect(team?.sponsors).toEqual(["REV Robotics", "Gene Haas Foundation", "River Dell Regional High Sch"]);
    const [, opts] = mockFetch().mock.calls[0];
    const auth = (opts as any).headers.Authorization as string;
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(auth).not.toContain("testtoken");
    expect(Buffer.from(auth.slice(6), "base64").toString()).toBe("testuser:testtoken");
    expect((opts as any).redirect).toBe("error");
  });

  it("never substitutes an unrelated team or event", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 9999, nameShort: "Other" }] }) as any);
    expect(await getFirstEventsTeam(2025, 4215)).toBeNull();
    mockFetch().mockResolvedValueOnce(jsonResponse({ events: [{ code: "OTHER", name: "Other" }] }) as any);
    expect(await getFirstEventsEvent(2025, "USNJCMP")).toBeNull();
  });

  it("returns null on 404 for unknown team", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 404) as any);
    expect(await getFirstEventsTeam(2025, 999999)).toBeNull();
  });

  it("treats FIRST's 400 'Team number N was not found' as no record (H-3 root cause), not an outage", async () => {
    // Real FIRST response for a team not registered in the season.
    const notFound = () => ({ ok: false, status: 400, headers: { get: () => null }, text: async () => '"Malformed Parameter Format In Request : Team number 11115 was not found"' });
    mockFetch().mockResolvedValueOnce(notFound() as any);
    expect(await getFirstEventsTeam(2026, 11115)).toBeNull();
    mockFetch().mockResolvedValueOnce(notFound() as any);
    expect(await getFirstEventsTeamEvents(2026, 11115)).toEqual([]);
  });

  it("other 400s are still errors (not silently 'no record')", async () => {
    mockFetch().mockResolvedValueOnce({ ok: false, status: 400, headers: { get: () => null }, text: async () => '"Invalid season"' } as any);
    await expect(getFirstEventsTeam(1999, 1)).rejects.toBeInstanceOf(FirstEventsError);
  });

  it("throws non-retryable on 401", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 401) as any);
    await expect(getFirstEventsTeam(2025, 1)).rejects.toBeInstanceOf(FirstEventsError);
    expect(mockFetch()).toHaveBeenCalledTimes(1);
  });

  it("retries once on 500 then succeeds", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 500) as any)
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 1, nameShort: "One" }] }) as any);
    const team = await getFirstEventsTeam(2025, 1);
    expect(team?.teamNumber).toBe(1);
    expect(mockFetch()).toHaveBeenCalledTimes(2);
  });

  it("throws after retry exhausted on persistent 500", async () => {
    mockFetch().mockResolvedValue(jsonResponse({}, 500) as any);
    await expect(getFirstEventsTeam(2025, 1)).rejects.toBeInstanceOf(FirstEventsError);
    expect(mockFetch()).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("a 429 wait does not consume the error retry", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }) as any)
      .mockResolvedValueOnce(jsonResponse({}, 503) as any)
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 2, nameShort: "T2" }] }) as any);
    const team = await getFirstEventsTeam(2025, 2);
    expect(team?.teamNumber).toBe(2);
    expect(mockFetch()).toHaveBeenCalledTimes(3);
  });

  it("the timeout also covers reading the body", async () => {
    let aborted = false;
    mockFetch().mockImplementation(async (_url: any, opts: any) => {
      opts.signal.addEventListener("abort", () => { aborted = true; });
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        // Body read waits for the abort, like a stalled stream would.
        text: () => new Promise((_res, rej) => opts.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
      } as any;
    });
    vi.useFakeTimers();
    const p = getFirstEventsTeam(2025, 1).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000 + 1_000 + 10_000 + 10);
    const err = await p;
    expect(aborted).toBe(true);
    expect(err).toBeInstanceOf(FirstEventsError);
    expect(err.message).toBe("request timed out");
  });

  it("team events come from /events?teamNumber= and use `code`/`typeName`", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        events: [
          { code: "USNJCMP", name: "New Jersey Championship", typeName: "Championship", type: "4", dateStart: "2026-03-14T00:00:00" },
          { code: "usnjcmp", name: "dup", dateStart: "2026-03-14T00:00:00" },
          { code: "USNJNLM1", name: "Northern League Meet 1", typeName: "League Meet", dateStart: "2025-11-08T00:00:00" },
        ],
        eventCount: 3,
      }) as any
    );
    const events = await getFirstEventsTeamEvents(2025, 4215);
    expect(calledUrl()).toBe(`${BASE}/2025/events?teamNumber=4215`);
    expect(events.map((e) => e.eventCode)).toEqual(["USNJNLM1", "USNJCMP"]);
    expect(events[1].eventType).toBe("Championship");
    expect(events[1].dateStart).toBe("2026-03-14");
  });

  it("parses SeasonEventModel (code, typeName, lowercase stateprov)", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        events: [{ code: "USNJCMP", name: "NJ Championship", typeName: "Championship", venue: "Raider Arena", city: "Hillsborough", stateprov: "NJ", country: "USA", timezone: "Eastern Standard Time", dateStart: "2026-03-14T00:00:00", dateEnd: "2026-03-15T00:00:00" }],
      }) as any
    );
    const ev = await getFirstEventsEvent(2025, "usnjcmp");
    expect(calledUrl()).toBe(`${BASE}/2025/events?eventCode=usnjcmp`);
    expect(ev?.eventCode).toBe("USNJCMP");
    expect(ev?.state).toBe("NJ");
    expect(ev?.eventType).toBe("Championship");
    expect(ev?.dateEnd).toBe("2026-03-15");
  });

  it("event teams come from /teams?eventCode= and follow every page", async () => {
    mockFetch()
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 2, nameShort: "Two" }, { teamNumber: 1, nameShort: "One" }], pageCurrent: 1, pageTotal: 2 }) as any)
      .mockResolvedValueOnce(jsonResponse({ teams: [{ teamNumber: 3, nameShort: "Three" }, { teamNumber: 1, nameShort: "One dup" }], pageCurrent: 2, pageTotal: 2 }) as any);
    const teams = await getFirstEventsEventTeams(2025, "USNJCMP");
    expect(calledUrl(0)).toBe(`${BASE}/2025/teams?eventCode=USNJCMP&page=1`);
    expect(calledUrl(1)).toBe(`${BASE}/2025/teams?eventCode=USNJCMP&page=2`);
    expect(teams.map((t) => t.teamNumber)).toEqual([1, 2, 3]);
    expect(teams[0].name).toBe("One");
  });

  it("rankings come from /rankings/{eventCode}; malformed entries dropped", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        rankings: [
          { rank: 2, teamNumber: 4215, teamName: "Hypnotic", sortOrder1: 4.2, wins: 4, losses: 1, ties: 0, qualAverage: 171.4 },
          { rank: 1, teamNumber: 14481, sortOrder1: 5, wins: 5, losses: 0, ties: 0 },
          { teamNumber: "bad" },
          null,
          { rank: 3 },
        ],
      }) as any
    );
    const rankings = await getFirstEventsRankings(2025, "USNJCMP");
    expect(calledUrl()).toBe(`${BASE}/2025/rankings/USNJCMP`);
    expect(rankings.map((r) => r.teamNumber)).toEqual([14481, 4215]);
    expect(rankings[1].rankingPoints).toBe(4.2);
  });

  it("returns [] for rankings when the event isn't found (404)", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({}, 404) as any);
    expect(await getFirstEventsRankings(2025, "NOPE")).toEqual([]);
  });

  it("match results: station-partitioned teams + top-level final scores", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        matches: [
          {
            description: "Qualification 1", tournamentLevel: "QUALIFICATION", series: 0, matchNumber: 1,
            scoreRedFinal: 171, scoreBlueFinal: 242,
            teams: [
              { teamNumber: 4215, station: "Red2", dq: false, onField: true },
              { teamNumber: 14481, station: "Red1", dq: false, onField: true },
              { teamNumber: 17670, station: "Blue1", dq: false, onField: true },
              { teamNumber: 23786, station: "Blue2", dq: false, onField: true },
            ],
          },
        ],
      }) as any
    );
    const [m] = await getFirstEventsMatches(2025, "USNJCMP");
    expect(calledUrl()).toBe(`${BASE}/2025/matches/USNJCMP`);
    expect(m.level).toBe("qual");
    expect(m.red).toMatchObject({ teams: [14481, 4215], score: 171 });
    expect(m.blue).toMatchObject({ teams: [17670, 23786], score: 242 });
  });

  it("schedule comes from /schedule/{eventCode}?tournamentLevel= (array `schedule`), series kept distinct", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        schedule: [
          { description: "Match 1 (R1)", tournamentLevel: "PLAYOFF", series: 1, matchNumber: 1, teams: [{ teamNumber: 1, station: "Red1" }, { teamNumber: 2, station: "Blue1" }] },
          { description: "Match 1 (R2)", tournamentLevel: "PLAYOFF", series: 2, matchNumber: 1, teams: [{ teamNumber: 3, station: "Red1" }, { teamNumber: 4, station: "Blue1" }] },
          { description: "dup", tournamentLevel: "PLAYOFF", series: 2, matchNumber: 1, teams: [] },
        ],
      }) as any
    );
    const sched = await getFirstEventsSchedule(2025, "USNJCMP", "playoff");
    expect(calledUrl()).toBe(`${BASE}/2025/schedule/USNJCMP?tournamentLevel=playoff`);
    expect(sched).toHaveLength(2);
    expect(sched.map((m) => matchKey(m))).toEqual(["playoff:1:1", "playoff:2:1"]);
    expect(sched[0].red.score).toBeNull(); // unplayed
  });

  it("alliances come from /alliances/{eventCode} with round1/round2/round3 objects", async () => {
    mockFetch().mockResolvedValueOnce(
      jsonResponse({
        alliances: [
          { number: 1, name: "Alliance 1", captain: { teamNumber: 100 }, round1: { teamNumber: 200 }, round2: { teamNumber: 300 }, round3: null, backup: null },
        ],
        count: 1,
      }) as any
    );
    const [a] = await getFirstEventsAlliances(2025, "USNJCMP");
    expect(calledUrl()).toBe(`${BASE}/2025/alliances/USNJCMP`);
    expect(a).toMatchObject({ number: 1, captain: 100, pick1: 200, pick2: 300, pick3: null, backup: null });
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
});
