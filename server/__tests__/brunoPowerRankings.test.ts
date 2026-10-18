/**
 * POST /internal/bruno/power-rankings: Bruno writes Control Scout's weekly
 * power-rankings blurbs from a fact packet (server/brunoPowerRankings.ts,
 * contract in the header of server/sharedAccounts.ts). The model is always a
 * fake here; no test reaches Gemini or Anthropic.
 */
import http from "http";
import express from "express";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createSharedAccounts, POWER_RANKINGS_RATE } from "../sharedAccounts";
import {
  MAX_BLURB_WORDS,
  MAX_PROMPT_CHARS,
  POWER_RANKINGS_SYSTEM,
  buildPowerRankingsPrompt,
  parsePowerRankingsOutput,
  validatePacket,
} from "../brunoPowerRankings";
import { aiChat, routeChatRequest } from "../../ai-hybrid";

const KEY = "test-internal-key-0123456789-abcdefghijklmnop";

function team(i: number, extra: Record<string, unknown> = {}) {
  return {
    team: 10000 + i,
    name: `Team ${i}`,
    rank: i,
    priorRank: i === 3 ? null : i + 1,
    movement: i === 3 ? null : 1,
    rating: 100 - i,
    ratingDelta: 2.5,
    record: { wins: 9, losses: 1, ties: 0 },
    opr: 118.4,
    lastEvent: { name: "Texas Championship", result: "Winning alliance captain" },
    ...extra,
  };
}
const packet = (n = 25, extra: Record<string, unknown> = {}) => ({
  season: 2026,
  week: "2026-w43",
  teams: Array.from({ length: n }, (_, i) => team(i + 1)),
  ...extra,
});
const reply = (p: { teams: { team: number }[] }, intro = "A busy week at the top.") =>
  JSON.stringify({ intro, blurbs: p.teams.map((t) => ({ team: t.team, text: `Team ${t.team} keeps rolling.` })) });

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function boot(opts: { env?: Record<string, string>; brunoWrite?: any; now?: () => number } = {}) {
  const shared = createSharedAccounts({
    dbGet: async () => null,
    dbAll: async () => [],
    dbRun: async () => ({ changes: 0, lastInsertRowid: 0 }),
    sessionEmail: async () => null,
    countAdmins: async () => 0,
    removeMembership: async () => {},
    brunoWrite: opts.brunoWrite,
    env: opts.env ?? { CONTROL_SCOUT_INTERNAL_KEY: KEY },
    now: opts.now,
  });
  const app = express();
  app.use("/internal", shared.internalRouter());
  const server = http.createServer(app);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  return async (body: unknown, key: string | null = KEY) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (key !== null) headers["x-internal-key"] = key;
    const r = await fetch(`http://127.0.0.1:${port}/internal/bruno/power-rankings`, {
      method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null), retryAfter: r.headers.get("retry-after") };
  };
}

describe("auth", () => {
  it("is 404 when CONTROL_SCOUT_INTERNAL_KEY is unset, with or without a key", async () => {
    const write = vi.fn();
    const post = await boot({ env: {}, brunoWrite: write });
    expect((await post(packet())).status).toBe(404);
    expect((await post(packet(), null)).status).toBe(404);
    expect(write).not.toHaveBeenCalled();
  });
  it("is 401 on a wrong or missing key, and never calls Bruno", async () => {
    const write = vi.fn();
    const post = await boot({ brunoWrite: write });
    expect((await post(packet(), "wrong-key")).status).toBe(401);
    expect((await post(packet(), null)).status).toBe(401);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  const bad: [string, unknown, string][] = [
    ["not an object", [], "invalid_body"],
    ["bad season", packet(25, { season: 1999 }), "season"],
    ["bad week", packet(25, { week: "2026-43" }), "week"],
    ["week 54", packet(25, { week: "2026-w54" }), "week"],
    ["no teams", packet(0), "teams"],
    ["too many teams", { ...packet(), teams: Array.from({ length: 26 }, (_, i) => team(i + 1)) }, "teams"],
    ["team not an integer", { ...packet(1), teams: [team(1, { team: "12a" })] }, "teams[0].team"],
    ["empty name", { ...packet(1), teams: [team(1, { name: "  " })] }, "teams[0].name_required"],
    ["long name", { ...packet(1), teams: [team(1, { name: "x".repeat(81) })] }, "teams[0].name_too_long"],
    ["rating not a number", { ...packet(1), teams: [team(1, { rating: "high" })] }, "teams[0].rating"],
    ["bad record", { ...packet(1), teams: [team(1, { record: { wins: -1, losses: 0 } })] }, "teams[0].record"],
    ["bad lastEvent", { ...packet(1), teams: [team(1, { lastEvent: "Texas" })] }, "teams[0].lastEvent"],
    ["long notes", { ...packet(1), teams: [team(1, { notes: "n".repeat(201) })] }, "teams[0].notes_too_long"],
    ["duplicate team", { ...packet(2), teams: [team(1), team(2, { team: 10001 })] }, "teams[1].duplicate_team"],
    ["duplicate rank", { ...packet(2), teams: [team(1), team(2, { rank: 1 })] }, "teams[1].duplicate_rank"],
  ];
  for (const [label, body, field] of bad) {
    it(`rejects ${label}`, () => {
      const r = validatePacket(body);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe(field);
    });
  }

  it("answers 400 with the failing field and never calls Bruno", async () => {
    const write = vi.fn();
    const post = await boot({ brunoWrite: write });
    const r = await post(packet(25, { week: "soon" }));
    expect(r).toMatchObject({ status: 400, body: { error: "invalid_packet", field: "week" } });
    expect(write).not.toHaveBeenCalled();
  });

  it("caps the body size (the router's 16 kB JSON limit)", async () => {
    const write = vi.fn();
    const post = await boot({ brunoWrite: write });
    const r = await post(packet(25, { padding: "p".repeat(20_000) }));
    expect(r.status).toBe(413);
    expect(write).not.toHaveBeenCalled();
  });

  /** A 25-team packet with every string at its cap except team notes, which are `notes` characters. */
  const maxed = (notes: number) => ({
    ...packet(),
    notes: "n".repeat(200),
    teams: Array.from({ length: 25 }, (_, i) => team(i + 1, {
      team: 900000 + i, name: "N".repeat(80), ...(notes ? { notes: "z".repeat(notes) } : {}),
      lastEvent: { name: "E".repeat(120), result: "R".repeat(80) },
    })),
  });

  it("refuses a packet whose prompt would be cut off by Bruno's 16,000-character message cap", async () => {
    // Long team notes: under the 16 kB body limit, but the prompt would be too long for the model path.
    expect(JSON.stringify(maxed(170)).length).toBeLessThan(16 * 1024);
    expect(validatePacket(maxed(170))).toMatchObject({ ok: false, error: "packet_too_large" });
    const write = vi.fn();
    const post = await boot({ brunoWrite: write });
    expect(await post(maxed(170))).toMatchObject({ status: 400, body: { error: "invalid_packet", field: "packet_too_large" } });
    expect(write).not.toHaveBeenCalled();
  });

  it("an accepted packet reaches the model whole, through the Gemini path", async () => {
    // The largest packet without team notes is accepted; its prompt fits the cap.
    const v = validatePacket(maxed(0));
    expect(v.ok).toBe(true);
    const prompt = buildPowerRankingsPrompt(v.value!);
    expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    const env = { ...process.env };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      process.env.GEMINI_API_KEY = "test-key";
      delete process.env.ANTHROPIC_API_KEY;
      await aiChat({ extraSystem: POWER_RANKINGS_SYSTEM, messages: [{ role: "user", text: prompt }], maxTokens: 100, stream: false, offline: true });
      const sent = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
      const text = sent.contents.at(-1).parts[0].text as string;
      expect(text).toBe(prompt);
      expect(text).toContain(`"team":900024`);
      expect(sent.tools).toBeUndefined(); // offline: no web search
    } finally {
      vi.unstubAllGlobals();
      process.env = env;
    }
  });

  it("drops unknown fields before the packet reaches the model", async () => {
    const write = vi.fn(async (job: any) => reply(packet(2)));
    const post = await boot({ brunoWrite: write });
    const body = { ...packet(2, { secret: "do-not-send" }), teams: [team(1, { email: "x@y.test" }), team(2)] };
    expect((await post(body)).status).toBe(200);
    const user = write.mock.calls[0][0].user as string;
    expect(user).not.toContain("do-not-send");
    expect(user).not.toContain("x@y.test");
    expect(user).toContain("Texas Championship");
  });
});

describe("the Bruno call", () => {
  it("returns strict JSON in rank order, with the job's endpoint name and rules", async () => {
    const p = packet();
    // Out of order, as a string team number, wrapped in a code fence: still parses.
    const raw = "```json\n" + JSON.stringify({
      intro: "What a week.",
      blurbs: [...p.teams].reverse().map((t, i) => ({ team: i === 0 ? String(t.team) : t.team, text: `  Team ${t.team}\nrolls on.  ` })),
    }) + "\n```";
    const write = vi.fn(async (_job: any) => raw);
    const post = await boot({ brunoWrite: write });
    const r = await post(p);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(["blurbs", "intro"]);
    expect(r.body.intro).toBe("What a week.");
    expect(r.body.blurbs.map((b: any) => b.team)).toEqual(p.teams.map((t) => t.team));
    expect(r.body.blurbs[0]).toEqual({ team: 10001, text: "Team 10001 rolls on." });
    const job = write.mock.calls[0][0] as any;
    expect(job.endpoint).toBe("power-rankings");
    expect(job.system).toBe(POWER_RANKINGS_SYSTEM);
    expect(job.maxTokens).toBeGreaterThan(1000);
  });

  it("the prompt states the rules: packet facts only, no other sites, word caps, JSON only", () => {
    expect(POWER_RANKINGS_SYSTEM).toMatch(/ONLY facts in the packet/);
    expect(POWER_RANKINGS_SYSTEM).toMatch(/Never invent scores, match results, awards, events/);
    expect(POWER_RANKINGS_SYSTEM).toMatch(/Never mention, name or link any other scouting, stats or rankings website/);
    expect(POWER_RANKINGS_SYSTEM).toContain(`at most ${MAX_BLURB_WORDS} words`);
    expect(POWER_RANKINGS_SYSTEM).toContain("at most 80 words");
    expect(POWER_RANKINGS_SYSTEM).toMatch(/Reply with JSON only/);
    expect(POWER_RANKINGS_SYSTEM).toMatch(/friendly FTC commentator/);
    const v = validatePacket(packet(2));
    expect(v.ok && buildPowerRankingsPrompt(v.value)).toContain('"week":"2026-w43"');
  });

  it("a failed model call is 502 ai_failed; no provider configured is 503", async () => {
    const post = await boot({ brunoWrite: async () => { throw new Error("Gemini 500"); } });
    expect(await post(packet())).toMatchObject({ status: 502, body: { error: "ai_failed" } });
    const post2 = await boot({ brunoWrite: async () => { throw new Error("AI not configured: set GEMINI_API_KEY or ANTHROPIC_API_KEY"); } });
    expect(await post2(packet())).toMatchObject({ status: 503, body: { error: "ai_unavailable" } });
    const post3 = await boot({});
    expect(await post3(packet())).toMatchObject({ status: 503, body: { error: "ai_unavailable" } });
  });

  for (const [label, raw] of [
    ["prose", "Here are your rankings! Team 1 is great."],
    ["broken JSON", '{"intro": "x", "blurbs": [{"team": 10001, "text": "hi"}'],
    ["blurbs not an array", '{"intro": "x", "blurbs": "none"}'],
    ["intro not a string", '{"intro": 5, "blurbs": [{"team": 10001, "text": "hi"}]}'],
    ["no usable blurb", '{"intro": "x", "blurbs": [{"team": 99, "text": "hi"}]}'],
    ["empty", ""],
  ] as const) {
    it(`malformed output (${label}) is 502 malformed_output`, async () => {
      const post = await boot({ brunoWrite: async () => raw });
      expect(await post(packet())).toMatchObject({ status: 502, body: { error: "malformed_output" } });
    });
  }

  it("leaves out blurbs that break a rule, and an over-long intro becomes empty", () => {
    const v = validatePacket(packet(5));
    if (!v.ok) throw new Error("packet");
    const long = Array.from({ length: MAX_BLURB_WORDS + 1 }, () => "word").join(" ");
    const raw = JSON.stringify({
      intro: Array.from({ length: 81 }, () => "w").join(" "),
      blurbs: [
        { team: 10001, text: "Good." },
        { team: 10001, text: "Again." },
        { team: 4242, text: "Not in the packet." },
        { team: 10002, text: long },
        { team: 10003, text: "   " },
        { team: 10004, text: 7 },
        { team: 10005, text: "Fine." },
      ],
    });
    const { output, dropped } = parsePowerRankingsOutput(raw, v.value);
    expect(output.intro).toBe("");
    expect(output.blurbs).toEqual([{ team: 10001, text: "Good." }, { team: 10005, text: "Fine." }]);
    expect(dropped.map((d) => d.reason).sort()).toEqual(["duplicate", "empty", "intro_too_long", "not_text", "too_long", "unknown_team"]);
  });

  it(`allows ${POWER_RANKINGS_RATE.max} calls an hour, then 429 with Retry-After`, async () => {
    let t = 1_000_000;
    const write = vi.fn(async () => reply(packet(1)));
    const post = await boot({ brunoWrite: write, now: () => t });
    for (let i = 0; i < POWER_RANKINGS_RATE.max; i++) expect((await post(packet(1))).status).toBe(200);
    const over = await post(packet(1));
    expect(over).toMatchObject({ status: 429, body: { error: "rate_limited" } });
    expect(Number(over.retryAfter)).toBeGreaterThan(0);
    expect(write).toHaveBeenCalledTimes(POWER_RANKINGS_RATE.max);
    // Invalid packets never spend the allowance (checked before the limiter).
    expect((await post({ season: 1 })).status).toBe(400);
    t += POWER_RANKINGS_RATE.windowMs + 1;
    expect((await post(packet(1))).status).toBe(200);
  });
});

describe("offline routing", () => {
  it("offline never grounds, even on text that would otherwise trigger web search", () => {
    const text = "Latest news: current rankings for the 2026 championship";
    expect(routeChatRequest({ text }).grounded).toBe(true);
    expect(routeChatRequest({ text, offline: true }).grounded).toBe(false);
    expect(routeChatRequest({ text, webSearch: true, offline: true }).grounded).toBe(false);
  });
});
