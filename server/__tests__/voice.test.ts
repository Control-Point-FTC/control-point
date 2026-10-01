/**
 * Backend tests for the voice/video calling system (server/voice.ts).
 *
 * The voice module takes all of its I/O through the injected VoiceDeps, so
 * these tests run against an in-memory libsql database (the real voice table
 * migration is applied; foreign keys are off and a minimal members stub is
 * provided) plus a fake express-like app that captures route handlers by
 * method+path. No server is booted and no DB file is touched.
 *
 * Covered:
 *  - pure helpers (channel access, signal validation, ICE servers, TTLs)
 *  - REST routes via registerVoiceRoutes (join guards, moderation, calls)
 *  - WebSocket signaling via handleVoiceWSMessage (relay rules, state)
 *  - the reconnect grace period (schedule / cancel / fire)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import {
  registerVoiceRoutes,
  handleVoiceWSMessage,
  resolveChannelAccess,
  validateSignalPayload,
  iceServersFromEnv,
  inviteTtlSeconds,
  reconnectGraceSeconds,
  scheduleVoiceDisconnectCleanup,
  cancelVoiceDisconnectCleanup,
  type VoiceDeps,
  type VoiceAuth,
} from "../voice";

const MIGRATION_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrations/versions/002-voice-calls.sql"),
  "utf8"
);
const MIGRATION_003_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrations/versions/003-voice-audio-quality.sql"),
  "utf8"
);
const MIGRATION_004_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../migrations/versions/004-voice-temp-channels.sql"),
  "utf8"
);

// Minimal members table: only the columns voice.ts reads.
const MEMBERS_STUB_DDL = `
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  name TEXT NOT NULL,
  avatar_url TEXT,
  status TEXT DEFAULT 'online',
  is_active INTEGER DEFAULT 1
);`;

// ---------------------------------------------------------------------------
// Fixture: fake express app + in-memory DB-backed VoiceDeps
// ---------------------------------------------------------------------------

type RouteHandler = (req: any, res: any) => unknown;

interface FakeRes {
  statusCode: number;
  body: any;
  status(code: number): FakeRes;
  json(payload: any): FakeRes;
}

interface FakeApp {
  routes: Map<string, RouteHandler>;
}

function makeApp(): FakeApp & {
  get(p: string, h: RouteHandler): void;
  post(p: string, h: RouteHandler): void;
  patch(p: string, h: RouteHandler): void;
  put(p: string, h: RouteHandler): void;
  delete(p: string, h: RouteHandler): void;
} {
  const routes = new Map<string, RouteHandler>();
  return {
    routes,
    get: (p, h) => { routes.set(`GET ${p}`, h); },
    post: (p, h) => { routes.set(`POST ${p}`, h); },
    patch: (p, h) => { routes.set(`PATCH ${p}`, h); },
    put: (p, h) => { routes.set(`PUT ${p}`, h); },
    delete: (p, h) => { routes.set(`DELETE ${p}`, h); },
  };
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: any) { res.body = payload; return res; },
  };
  return res;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const pSegs = pattern.split("/");
  const sSegs = path.split("/");
  if (pSegs.length !== sSegs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i].startsWith(":")) params[pSegs[i].slice(1)] = sSegs[i];
    else if (pSegs[i] !== sSegs[i]) return null;
  }
  return params;
}

interface Fixture {
  client: Client;
  app: FakeApp;
  deps: VoiceDeps;
  broadcasts: Array<{ teamId: number; data: any }>;
  directMessages: Array<{ teamId: number; memberId: number; data: any }>;
  perms: Map<string, Set<string>>;
  authFor(memberId: number, teamId?: number): VoiceAuth;
  sqlAll(sql: string, ...params: any[]): Promise<any[]>;
  sqlGet(sql: string, ...params: any[]): Promise<any>;
}

async function makeFixture(env: Record<string, string | undefined> = {}): Promise<Fixture> {
  const client = createClient({ url: "file::memory:" });
  await client.execute("PRAGMA foreign_keys=OFF");
  await client.executeMultiple(MEMBERS_STUB_DDL);
  await client.executeMultiple(MIGRATION_SQL);
  await client.executeMultiple(MIGRATION_003_SQL);
  await client.executeMultiple(MIGRATION_004_SQL);

  const broadcasts: Fixture["broadcasts"] = [];
  const directMessages: Fixture["directMessages"] = [];
  const perms = new Map<string, Set<string>>();

  const sqlAll = async (sql: string, ...params: any[]) =>
    ((await client.execute({ sql, args: params })).rows as any[]);
  const sqlGet = async (sql: string, ...params: any[]) =>
    ((await client.execute({ sql, args: params })).rows as any[])[0];

  const deps: VoiceDeps = {
    dbAll: sqlAll,
    dbGet: sqlGet,
    dbRun: async (sql: string, ...params: any[]) => {
      const r = await client.execute({ sql, args: params });
      return { lastInsertRowid: r.lastInsertRowid, rowsAffected: r.rowsAffected };
    },
    requireAuth: async (req: any, res: any) => {
      if (req.__auth) return req.__auth as VoiceAuth;
      res.status(401).json({ error: "Unauthorized" });
      return null;
    },
    requirePerm: async (req: any, res: any, perm: string) => {
      const a = req.__auth as (VoiceAuth & { __perms?: Set<string> }) | undefined;
      if (!a) { res.status(401).json({ error: "Unauthorized" }); return null; }
      if (a.__perms?.has("*") || a.__perms?.has(perm)) return a;
      res.status(403).json({ error: "Forbidden" });
      return null;
    },
    hasPerm: async (auth: any, perm: string) =>
      Boolean(auth?.__perms?.has("*") || auth?.__perms?.has(perm)),
    getMemberPerms: async (memberId: number, teamId: number | null) =>
      perms.get(`${teamId}:${memberId}`) ?? new Set<string>(),
    memberRoleIds: async () => [],
    broadcastToTeam: (teamId: number, data: any) => { broadcasts.push({ teamId, data }); },
    sendToMember: (teamId: number, memberId: number, data: any) => {
      directMessages.push({ teamId, memberId, data });
    },
    memberSocketCount: () => 0,
    env,
    nowIso: () => new Date().toISOString(),
  };

  const app = makeApp();
  registerVoiceRoutes(app, deps);

  return {
    client, app, deps, broadcasts, directMessages, perms,
    authFor(memberId: number, teamId = 1) {
      const a: any = {
        memberId, teamId, accountType: "student",
        __perms: perms.get(`${teamId}:${memberId}`) ?? new Set<string>(),
      };
      return a as VoiceAuth;
    },
    sqlAll, sqlGet,
  };
}

/** Seed team 1: member 1 = owner (all perms), 2/3 = regulars, plus member 4 on team 2. */
async function seedTeam(fx: Fixture): Promise<void> {
  const members: Array<[number, number, string]> = [
    [1, 1, "Owner"], [2, 1, "Ash"], [3, 1, "Kai"], [4, 2, "Rook"],
  ];
  for (const [id, teamId, name] of members) {
    await fx.client.execute({
      sql: "INSERT INTO members (id, team_id, name) VALUES (?, ?, ?)",
      args: [id, teamId, name],
    });
  }
  fx.perms.set("1:1", new Set(["*"]));
}

async function addVoiceChannel(
  fx: Fixture,
  name: string,
  opts: { is_private?: number; locked?: number; max_participants?: number } = {}
): Promise<number> {
  const r = await fx.client.execute({
    sql: "INSERT INTO voice_channels (team_id, name, is_private, locked, max_participants) VALUES (1, ?, ?, ?, ?)",
    args: [name, opts.is_private ?? 0, opts.locked ?? 0, opts.max_participants ?? 0],
  });
  return Number(r.lastInsertRowid);
}

async function callRoute(
  fx: Fixture,
  method: string,
  path: string,
  opts: { body?: any; auth?: VoiceAuth } = {}
): Promise<FakeRes> {
  for (const [key, handler] of fx.app.routes) {
    const space = key.indexOf(" ");
    if (key.slice(0, space) !== method) continue;
    const params = matchPattern(key.slice(space + 1), path);
    if (!params) continue;
    const req: any = { params, body: opts.body ?? {}, __auth: opts.auth ?? null };
    const res = makeRes();
    await handler(req, res);
    return res;
  }
  throw new Error(`no route registered for ${method} ${path}`);
}

async function joinChannel(fx: Fixture, memberId: number, channelId: number): Promise<number> {
  const res = await callRoute(fx, "POST", `/api/voice/channels/${channelId}/join`, {
    auth: fx.authFor(memberId),
  });
  expect(res.statusCode).toBe(200);
  return res.body.session.id as number;
}

function makeWs(memberId: number, teamId = 1) {
  return { teamId, memberId, send: vi.fn() };
}

let fx: Fixture;

beforeEach(async () => {
  fx = await makeFixture();
  await seedTeam(fx);
});

afterEach(async () => {
  // Never leak a pending grace timer into another test.
  cancelVoiceDisconnectCleanup(1, 1);
  cancelVoiceDisconnectCleanup(1, 2);
  cancelVoiceDisconnectCleanup(1, 3);
  vi.useRealTimers();
  if (fx) await fx.client.close();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("resolveChannelAccess", () => {
  const baseChannel = { is_private: 0, allow_video: 1, allow_screenshare: 1 };
  const open = {
    channel: baseChannel, memberRoleIds: [], overrideRows: [],
    videoEnabled: true, screenshareEnabled: true, isPrivileged: false,
  };

  it("allows everything by default on a public channel with no overrides", () => {
    expect(resolveChannelAccess(open)).toEqual({
      canView: true, canJoin: true, canSpeak: true, canVideo: true, canScreenshare: true,
    });
  });

  it("honors a role override that denies joining", () => {
    const access = resolveChannelAccess({
      ...open,
      memberRoleIds: [5],
      overrideRows: [
        { role_id: 5, can_view: 1, can_join: 0, can_speak: 1, can_video: 1, can_screenshare: 1 },
      ],
    });
    expect(access.canView).toBe(true);
    expect(access.canJoin).toBe(false);
    expect(access.canSpeak).toBe(true);
  });

  it("ignores overrides for roles the member does not have", () => {
    const access = resolveChannelAccess({
      ...open,
      memberRoleIds: [7],
      overrideRows: [
        { role_id: 5, can_view: 0, can_join: 0, can_speak: 0, can_video: 0, can_screenshare: 0 },
      ],
    });
    expect(access.canJoin).toBe(true);
  });

  it("denies a private channel with no grants", () => {
    const access = resolveChannelAccess({
      ...open,
      channel: { ...baseChannel, is_private: 1 },
    });
    expect(access.canView).toBe(false);
    expect(access.canJoin).toBe(false);
  });

  it("grants a private channel when a role override allows it", () => {
    const access = resolveChannelAccess({
      ...open,
      channel: { ...baseChannel, is_private: 1 },
      memberRoleIds: [5],
      overrideRows: [
        { role_id: 5, can_view: 1, can_join: 1, can_speak: 1, can_video: 0, can_screenshare: 0 },
      ],
    });
    expect(access.canView).toBe(true);
    expect(access.canJoin).toBe(true);
    expect(access.canVideo).toBe(false);
  });

  it("lets privileged members bypass channel ACLs", () => {
    const access = resolveChannelAccess({
      ...open,
      channel: { ...baseChannel, is_private: 1 },
      isPrivileged: true,
    });
    expect(access.canView).toBe(true);
    expect(access.canJoin).toBe(true);
    expect(access.canSpeak).toBe(true);
  });

  it("respects the channel and team video/screenshare flags", () => {
    expect(resolveChannelAccess({ ...open, videoEnabled: false }).canVideo).toBe(false);
    expect(
      resolveChannelAccess({
        ...open, channel: { ...baseChannel, allow_screenshare: 0 },
      }).canScreenshare
    ).toBe(false);
  });
});

describe("validateSignalPayload", () => {
  const offer = (sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1") => ({
    to_member_id: 3,
    payload: { kind: "offer", sdp },
  });

  it("accepts offer/answer SDP payloads", () => {
    expect(validateSignalPayload(offer())).toBeNull();
    expect(
      validateSignalPayload({ to_member_id: "3", payload: { kind: "answer", sdp: "v=0\r\no=- 2 2 IN IP4 10.0.0.1" } })
    ).toBeNull();
  });

  it("accepts ICE candidate payloads", () => {
    expect(
      validateSignalPayload({
        to_member_id: 3,
        payload: { kind: "ice", candidate: "candidate:1 1 udp 2122260223 192.168.1.5 54400 typ host" },
      })
    ).toBeNull();
  });

  it("rejects garbage", () => {
    expect(validateSignalPayload(null)).toBe("Invalid signal payload");
    expect(validateSignalPayload("nope")).toBe("Invalid signal payload");
    expect(validateSignalPayload({ ...offer(), to_member_id: 0 })).toBe("Invalid signal target");
    expect(validateSignalPayload({ ...offer(), to_member_id: "abc" })).toBe("Invalid signal target");
    expect(validateSignalPayload({ to_member_id: 3 })).toBe("Invalid signal payload");
    expect(
      validateSignalPayload({ to_member_id: 3, payload: { kind: "prank", sdp: "v=0\r\no=- 1 1 IN IP4 1.1.1.1" } })
    ).toBe("Unknown signal kind");
    expect(validateSignalPayload({ to_member_id: 3, payload: { kind: "offer" } })).toBe("Invalid SDP");
    expect(validateSignalPayload(offer("tiny"))).toBe("Invalid SDP");
    expect(
      validateSignalPayload({ to_member_id: 3, payload: { kind: "ice", candidate: 42 } })
    ).toBe("Invalid ICE candidate");
  });
});

describe("iceServersFromEnv", () => {
  it("defaults to the public STUN server", () => {
    const servers = iceServersFromEnv({});
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toEqual(["stun:stun.l.google.com:19302"]);
  });

  it("splits custom STUN urls", () => {
    const servers = iceServersFromEnv({ STUN_URLS: "stun:a:1, stun:b:2" });
    expect(servers[0].urls).toEqual(["stun:a:1", "stun:b:2"]);
  });

  it("wires TURN urls, username, and credential", () => {
    const servers = iceServersFromEnv({
      TURN_URLS: "turn:x:3478,turns:y:5349",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "pass",
    });
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({
      urls: ["turn:x:3478", "turns:y:5349"],
      username: "user",
      credential: "pass",
    });
  });

  it("omits TURN auth fields when unset", () => {
    const servers = iceServersFromEnv({ TURN_URLS: "turn:x:3478" });
    expect(servers[1]).toEqual({ urls: ["turn:x:3478"] });
  });

  it("includes no TURN entry when TURN_URLS is unset", () => {
    const servers = iceServersFromEnv({ STUN_URLS: "stun:a:1" });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toEqual({ urls: ["stun:a:1"] });
  });
});

describe("inviteTtlSeconds + reconnectGraceSeconds", () => {
  it("invite TTL defaults to 60 and clamps to 300", () => {
    expect(inviteTtlSeconds({})).toBe(60);
    expect(inviteTtlSeconds({ CALL_INVITE_TTL_SECONDS: "30" })).toBe(30);
    expect(inviteTtlSeconds({ CALL_INVITE_TTL_SECONDS: "1000" })).toBe(300);
    expect(inviteTtlSeconds({ CALL_INVITE_TTL_SECONDS: "0" })).toBe(60);
    expect(inviteTtlSeconds({ CALL_INVITE_TTL_SECONDS: "junk" })).toBe(60);
  });

  it("grace defaults to 45 and clamps to 5–300", () => {
    expect(reconnectGraceSeconds({})).toBe(45);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "120" })).toBe(120);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "1000" })).toBe(300);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "1" })).toBe(5);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "-5" })).toBe(5);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "junk" })).toBe(45);
    expect(reconnectGraceSeconds({ VOICE_RECONNECT_GRACE_SECONDS: "" })).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// REST routes (via registerVoiceRoutes with a fake express app)
// ---------------------------------------------------------------------------

describe("POST /api/voice/channels/:id/join", () => {
  let chPublic: number, chPrivate: number, chLocked: number, chTiny: number;

  beforeEach(async () => {
    chPublic = await addVoiceChannel(fx, "public");
    chPrivate = await addVoiceChannel(fx, "private", { is_private: 1 });
    chLocked = await addVoiceChannel(fx, "locked", { locked: 1 });
    chTiny = await addVoiceChannel(fx, "tiny", { max_participants: 1 });
  });

  it("200: joins a public channel and returns session + participants + ice", async () => {
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chPublic}/join`, {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.id).toEqual(expect.any(Number));
    expect(res.body.session.participants).toHaveLength(1);
    expect(res.body.session.participants[0].member_id).toBe(2);
    expect(res.body.session.participants[0].name).toBe("Ash");
    expect(Array.isArray(res.body.ice)).toBe(true);
    expect(res.body.ice[0].urls).toEqual(["stun:stun.l.google.com:19302"]);
    // presence went out to the team
    expect(
      fx.broadcasts.some((b) => b.data.type === "voice:presence" && b.data.session_id === res.body.session.id)
    ).toBe(true);
  });

  it("403: private channel without access", async () => {
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chPrivate}/join`, {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/permission/i);
  });

  it("200: privileged member bypasses the private ACL", async () => {
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chPrivate}/join`, {
      auth: fx.authFor(1),
    });
    expect(res.statusCode).toBe(200);
  });

  it("403: locked channel for non-privileged members", async () => {
    const denied = await callRoute(fx, "POST", `/api/voice/channels/${chLocked}/join`, {
      auth: fx.authFor(2),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body.error).toMatch(/locked/i);
    const allowed = await callRoute(fx, "POST", `/api/voice/channels/${chLocked}/join`, {
      auth: fx.authFor(1),
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("403: channel is full", async () => {
    await joinChannel(fx, 2, chTiny);
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chTiny}/join`, {
      auth: fx.authFor(3),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/full/i);
  });

  it("409: already in another call", async () => {
    const first = await joinChannel(fx, 2, chPublic);
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chTiny}/join`, {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.session_id).toBe(first);
  });

  it("200: rejoining the same channel is idempotent", async () => {
    const first = await joinChannel(fx, 2, chPublic);
    const res = await callRoute(fx, "POST", `/api/voice/channels/${chPublic}/join`, {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.session.id).toBe(first);
    const open = await fx.sqlAll(
      "SELECT id FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      first, 2
    );
    expect(open).toHaveLength(1);
  });

  it("404: unknown channel", async () => {
    const res = await callRoute(fx, "POST", "/api/voice/channels/9999/join", {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/voice/moderate", () => {
  let ch: number;

  beforeEach(async () => {
    ch = await addVoiceChannel(fx, "public");
  });

  it("403: without moderate_calls/manage_voice", async () => {
    const res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(2),
      body: { action: "mute", session_id: 1, target_member_id: 3 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("400: unknown action", async () => {
    const res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(1),
      body: { action: "explode", session_id: 1, target_member_id: 2 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unknown/i);
  });

  it("404: target is not in the session", async () => {
    const sessionId = await joinChannel(fx, 2, ch);
    const res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(1),
      body: { action: "mute", session_id: sessionId, target_member_id: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("mute: sets is_muted=1 and broadcasts voice:moderated", async () => {
    const sessionId = await joinChannel(fx, 2, ch);
    await joinChannel(fx, 3, ch);
    const res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(1),
      body: { action: "mute", session_id: sessionId, target_member_id: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = await fx.sqlGet(
      "SELECT is_muted FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      sessionId, 3
    );
    expect(row.is_muted).toBe(1);
    const moderated = fx.broadcasts.find((b) => b.data.type === "voice:moderated");
    expect(moderated?.data.action).toBe("mute");
    expect(moderated?.data.target_member_id).toBe(3);
    expect(moderated?.data.session_id).toBe(sessionId);
  });

  it("remove: ends the session when the last participant is removed", async () => {
    const sessionId = await joinChannel(fx, 2, ch);
    await joinChannel(fx, 3, ch);

    let res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(1),
      body: { action: "remove", session_id: sessionId, target_member_id: 3 },
    });
    expect(res.statusCode).toBe(200);
    // removed member is told to tear down
    expect(
      fx.directMessages.some(
        (m) => m.memberId === 3 && m.data.type === "voice:kicked" && m.data.reason === "removed"
      )
    ).toBe(true);
    // one participant left: session still alive
    let session = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(session.ended_at).toBeNull();

    res = await callRoute(fx, "POST", "/api/voice/moderate", {
      auth: fx.authFor(1),
      body: { action: "remove", session_id: sessionId, target_member_id: 2 },
    });
    expect(res.statusCode).toBe(200);
    session = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(session.ended_at).not.toBeNull();
    expect(
      fx.broadcasts.some(
        (b) => b.data.type === "voice:session-ended" && b.data.session_id === sessionId
      )
    ).toBe(true);
  });
});

describe("POST /api/voice/calls (ad-hoc public calls)", () => {
  it("creates a PUBLIC temp voice channel, invites the member, and accept joins them", async () => {
    const created = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [2] },
    });
    expect(created.statusCode).toBe(200);
    const sessionId = created.body.session_id;
    const channelId = created.body.channel_id;
    expect(typeof sessionId).toBe("number");
    expect(typeof channelId).toBe("number");

    // The channel is public and temporary — anyone on the team can join it.
    const ch = await fx.sqlGet("SELECT * FROM voice_channels WHERE id = ?", channelId);
    expect(ch.is_private).toBe(0);
    expect(ch.is_temporary).toBe(1);

    // The session is an ordinary voice_channel session on that channel.
    const sess = await fx.sqlGet("SELECT * FROM call_sessions WHERE id = ?", sessionId);
    expect(sess.kind).toBe("voice_channel");
    expect(sess.channel_id).toBe(channelId);

    // The invitee is rung with the channel info.
    const ring = fx.directMessages.find(
      (m) => m.memberId === 2 && m.data.type === "voice:incoming" && m.data.session_id === sessionId
    );
    expect(ring).toBeTruthy();
    expect(ring!.data.channel_id).toBe(channelId);

    const accepted = await callRoute(fx, "POST", `/api/voice/calls/${sessionId}/accept`, {
      auth: fx.authFor(2),
    });
    expect(accepted.statusCode).toBe(200);
    expect(Array.isArray(accepted.body.ice)).toBe(true);
    expect(accepted.body.session.channel_id).toBe(channelId);
    const row = await fx.sqlGet(
      "SELECT id FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      sessionId, 2
    );
    expect(row).toBeTruthy();
  });

  it("a third team member can join the ad-hoc call channel directly (it's public)", async () => {
    const created = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [2] },
    });
    expect(created.statusCode).toBe(200);
    const channelId = created.body.channel_id as number;
    // Member 3 was never invited, but the channel is public — join works.
    const sessionId = await joinChannel(fx, 3, channelId);
    expect(sessionId).toBe(created.body.session_id);
  });

  it("declining a stillborn call deletes the temp channel", async () => {
    const created = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [2] },
    });
    const sessionId = created.body.session_id as number;
    const channelId = created.body.channel_id as number;
    const declined = await callRoute(fx, "POST", `/api/voice/calls/${sessionId}/decline`, {
      auth: fx.authFor(2),
    });
    expect(declined.statusCode).toBe(200);
    const ch = await fx.sqlGet("SELECT id FROM voice_channels WHERE id = ?", channelId);
    expect(ch).toBeFalsy();
    const sess = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(sess.ended_at).not.toBeNull();
  });

  it("ending an ad-hoc call ends it for everyone and deletes the temp channel", async () => {
    const created = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [2] },
    });
    const sessionId = created.body.session_id as number;
    const channelId = created.body.channel_id as number;
    await callRoute(fx, "POST", `/api/voice/calls/${sessionId}/accept`, { auth: fx.authFor(2) });
    const ended = await callRoute(fx, "POST", `/api/voice/calls/${sessionId}/end`, {
      auth: fx.authFor(1),
    });
    expect(ended.statusCode).toBe(200);
    const sess = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(sess.ended_at).not.toBeNull();
    const ch = await fx.sqlGet("SELECT id FROM voice_channels WHERE id = ?", channelId);
    expect(ch).toBeFalsy();
    // The other participant was told the call ended.
    expect(
      fx.directMessages.some(
        (m) => m.memberId === 2 && m.data.type === "voice:kicked" && m.data.session_id === sessionId
      )
    ).toBe(true);
  });

  it("400: invitees must be real members of the team (client IDs re-validated)", async () => {
    const res = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [999] },
    });
    expect(res.statusCode).toBe(400);
    // member 4 is on team 2, not team 1
    const crossTeam = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "group", invitee_ids: [2, 4] },
    });
    expect(crossTeam.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// WebSocket signaling (handleVoiceWSMessage)
// ---------------------------------------------------------------------------

describe("voice:signal relay", () => {
  let ch: number, sessionId: number;
  const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1";

  beforeEach(async () => {
    ch = await addVoiceChannel(fx, "public");
    sessionId = await joinChannel(fx, 2, ch);
    await joinChannel(fx, 3, ch);
  });

  it("relays between two active participants of the same session", async () => {
    const ws = makeWs(2);
    const handled = await handleVoiceWSMessage(
      ws,
      { type: "voice:signal", to_member_id: 3, payload: { kind: "offer", sdp } },
      fx.deps
    );
    expect(handled).toBe(true);
    const relayed = fx.directMessages.find(
      (m) => m.memberId === 3 && m.data.type === "voice:signal"
    );
    expect(relayed).toBeTruthy();
    expect(relayed!.data.from_member_id).toBe(2);
    expect(relayed!.data.session_id).toBe(sessionId);
    expect(relayed!.data.payload).toEqual({ kind: "offer", sdp });
  });

  it("ignores a client-forged session_id and uses the sender's real session", async () => {
    const ws = makeWs(2);
    await handleVoiceWSMessage(
      ws,
      { type: "voice:signal", to_member_id: 3, session_id: 9999, payload: { kind: "offer", sdp } },
      fx.deps
    );
    const relayed = fx.directMessages.find(
      (m) => m.memberId === 3 && m.data.type === "voice:signal"
    );
    expect(relayed?.data.session_id).toBe(sessionId);
  });

  it("does not relay when the target is not in the session", async () => {
    const ws = makeWs(2);
    await handleVoiceWSMessage(
      ws,
      { type: "voice:signal", to_member_id: 4, payload: { kind: "offer", sdp } },
      fx.deps
    );
    expect(fx.directMessages.some((m) => m.data.type === "voice:signal")).toBe(false);
  });

  it("does not relay when the sender is not in any session", async () => {
    const ws = makeWs(1); // owner never joined
    await handleVoiceWSMessage(
      ws,
      { type: "voice:signal", to_member_id: 2, payload: { kind: "offer", sdp } },
      fx.deps
    );
    expect(fx.directMessages.some((m) => m.data.type === "voice:signal")).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("sends voice:error back on an invalid payload", async () => {
    const ws = makeWs(2);
    await handleVoiceWSMessage(
      ws,
      { type: "voice:signal", to_member_id: 3, payload: { kind: "offer" } },
      fx.deps
    );
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("voice:error");
    expect(typeof sent.error).toBe("string");
    expect(fx.directMessages.some((m) => m.data.type === "voice:signal")).toBe(false);
  });
});

describe("voice:state + voice:leave", () => {
  let ch: number, sessionId: number;

  beforeEach(async () => {
    ch = await addVoiceChannel(fx, "public");
    sessionId = await joinChannel(fx, 2, ch);
    await joinChannel(fx, 3, ch);
  });

  it("applies only whitelisted fields and broadcasts the patch", async () => {
    const ws = makeWs(2);
    await handleVoiceWSMessage(
      ws,
      {
        type: "voice:state",
        is_muted: true,
        camera_on: 1,
        connection_state: "reconnecting",
        bogus_field: 999,
      },
      fx.deps
    );
    const row = await fx.sqlGet(
      "SELECT is_muted, camera_on, connection_state FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      sessionId, 2
    );
    expect(row.is_muted).toBe(1);
    expect(row.camera_on).toBe(1);
    expect(row.connection_state).toBe("reconnecting");
    const broadcast = fx.broadcasts.find((b) => b.data.type === "voice:state");
    expect(broadcast?.data.member_id).toBe(2);
    expect(broadcast?.data.state).toEqual({
      is_muted: 1,
      camera_on: 1,
      connection_state: "reconnecting",
    });
  });

  it("ignores an invalid connection_state", async () => {
    const ws = makeWs(2);
    const before = fx.broadcasts.filter((b) => b.data.type === "voice:state").length;
    await handleVoiceWSMessage(ws, { type: "voice:state", connection_state: "nope" }, fx.deps);
    expect(fx.broadcasts.filter((b) => b.data.type === "voice:state")).toHaveLength(before);
  });

  it("voice:leave removes the participant; the last one out ends the session", async () => {
    await handleVoiceWSMessage(makeWs(2), { type: "voice:leave" }, fx.deps);
    let row = await fx.sqlGet(
      "SELECT left_at FROM call_participants WHERE session_id = ? AND member_id = ? ORDER BY id DESC LIMIT 1",
      sessionId, 2
    );
    expect(row.left_at).not.toBeNull();
    let session = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(session.ended_at).toBeNull();
    expect(
      fx.broadcasts.some((b) => b.data.type === "voice:presence" && b.data.session_id === sessionId)
    ).toBe(true);

    await handleVoiceWSMessage(makeWs(3), { type: "voice:leave" }, fx.deps);
    session = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(session.ended_at).not.toBeNull();
    expect(
      fx.broadcasts.some(
        (b) => b.data.type === "voice:session-ended" && b.data.session_id === sessionId
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reconnect grace period
// ---------------------------------------------------------------------------

describe("reconnect grace period", () => {
  let ch: number, sessionId: number;

  const openRow = () =>
    fx.sqlGet(
      "SELECT left_at FROM call_participants WHERE session_id = ? AND member_id = ? ORDER BY id DESC LIMIT 1",
      sessionId, 2
    );

  beforeEach(async () => {
    vi.useFakeTimers();
    ch = await addVoiceChannel(fx, "public");
    sessionId = await joinChannel(fx, 2, ch);
  });

  it("does not remove the participant immediately — only after the grace window", async () => {
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    // just inside the default 45s window: still in the call
    await vi.advanceTimersByTimeAsync(44_999);
    expect((await openRow()).left_at).toBeNull();
    // window elapsed: cleanup runs
    await vi.advanceTimersByTimeAsync(1);
    expect((await openRow()).left_at).not.toBeNull();
  });

  it("cancel clears the pending timer — no cleanup runs", async () => {
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    cancelVoiceDisconnectCleanup(1, 2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await openRow()).left_at).toBeNull();
  });

  it("re-scheduling replaces the pending timer", async () => {
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    // if the first timer had survived, this cancel would miss it
    cancelVoiceDisconnectCleanup(1, 2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await openRow()).left_at).toBeNull();
  });

  it("honors a small VOICE_RECONNECT_GRACE_SECONDS", async () => {
    // rebuild the fixture with a 5s grace (minimum clamp)
    await fx.client.close();
    fx = await makeFixture({ VOICE_RECONNECT_GRACE_SECONDS: "5" });
    await seedTeam(fx);
    ch = await addVoiceChannel(fx, "public");
    sessionId = await joinChannel(fx, 2, ch);

    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    await vi.advanceTimersByTimeAsync(4_999);
    expect((await openRow()).left_at).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect((await openRow()).left_at).not.toBeNull();
  });

  it("REST join during the grace window cancels the pending cleanup", async () => {
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2); // socket dropped
    const res = await callRoute(fx, "POST", `/api/voice/channels/${ch}/join`, {
      auth: fx.authFor(2),
    });
    expect(res.statusCode).toBe(200);
    await vi.advanceTimersByTimeAsync(120_000);
    // the stale timer must not yank the member out after they rejoined
    expect((await openRow()).left_at).toBeNull();
  });

  it("invite accept during the grace window cancels the pending cleanup", async () => {
    // member 2 leaves the channel call first so the DM accept isn't a 409
    await handleVoiceWSMessage(makeWs(2), { type: "voice:leave" }, fx.deps);
    const created = await callRoute(fx, "POST", "/api/voice/calls", {
      auth: fx.authFor(1),
      body: { kind: "dm", invitee_ids: [2] },
    });
    expect(created.statusCode).toBe(200);
    const dmSession = created.body.session_id as number;

    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2); // socket dropped
    const accepted = await callRoute(fx, "POST", `/api/voice/calls/${dmSession}/accept`, {
      auth: fx.authFor(2),
    });
    expect(accepted.statusCode).toBe(200);
    await vi.advanceTimersByTimeAsync(120_000);
    const row = await fx.sqlGet(
      "SELECT left_at FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      dmSession, 2
    );
    expect(row).toBeTruthy();
  });

  it("cleanup ends the session when the last participant's grace expires", async () => {
    scheduleVoiceDisconnectCleanup(fx.deps, 1, 2);
    await vi.advanceTimersByTimeAsync(60_000);
    const session = await fx.sqlGet("SELECT ended_at FROM call_sessions WHERE id = ?", sessionId);
    expect(session.ended_at).not.toBeNull();
    expect(
      fx.broadcasts.some(
        (b) => b.data.type === "voice:session-ended" && b.data.session_id === sessionId
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/voice/settings — default_audio_quality (migration 003)
// ---------------------------------------------------------------------------

describe("PUT /api/voice/settings (default_audio_quality)", () => {
  it("persists a valid audio quality and keeps other fields server-validated", async () => {
    const res = await callRoute(fx, "PUT", "/api/voice/settings", {
      auth: fx.authFor(1),
      body: { default_audio_quality: "high", reconnect_attempts: 99 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.settings.default_audio_quality).toBe("high");
    // reconnect_attempts is clamped server-side (0..20).
    expect(res.body.settings.reconnect_attempts).toBe(20);
    const row = await fx.sqlGet("SELECT default_audio_quality FROM team_voice_settings WHERE team_id = 1");
    expect(row.default_audio_quality).toBe("high");
  });

  it("falls back to the current value on invalid audio quality", async () => {
    const before = await callRoute(fx, "GET", "/api/voice/settings", { auth: fx.authFor(1) });
    expect(before.statusCode).toBe(200);
    expect(before.body.settings.default_audio_quality).toBe("medium");
    const res = await callRoute(fx, "PUT", "/api/voice/settings", {
      auth: fx.authFor(1),
      body: { default_audio_quality: "ultra" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.settings.default_audio_quality).toBe("medium");
  });

  it("requires manage_voice", async () => {
    const res = await callRoute(fx, "PUT", "/api/voice/settings", {
      auth: fx.authFor(2),
      body: { default_audio_quality: "low" },
    });
    expect(res.statusCode).toBe(403);
  });
});
