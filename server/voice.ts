// Discord-style voice & video calling for Control Point.
//
// Architecture:
//   - Signaling rides the existing WebSocket server (wss in server.ts). SDP
//     offers/answers and ICE candidates are relayed in-memory between the
//     two members of a call and are NEVER persisted.
//   - Media is peer-to-peer WebRTC (full mesh). The client engine
//     (src/voice/webrtc.ts) is structured behind a VoiceSignaling interface
//     so it can later be swapped for an SFU (LiveKit/mediasoup) without
//     touching call UI.
//   - Presence (who is in which call, mute/deafen/camera/screen flags) is
//     the source of truth in call_participants (left_at IS NULL = in call)
//     plus in-memory socket tracking for fast cleanup on disconnect.
//   - Every privileged action is validated server-side: channel access is
//     resolved from role overrides, moderation requires moderate_calls (or
//     manage_voice / *), and signal relay only happens between two active
//     participants of the same session. Client-supplied IDs are never
//     trusted — membership/team scoping is re-checked on every message.
//
// Privacy: no audio/video is recorded or stored, ever.

export interface VoiceAuth {
  memberId: number;
  teamId: number | null;
  accountType: string;
  email?: string;
}

export interface VoiceDeps {
  dbAll(sql: string, ...params: any[]): Promise<any[]>;
  dbGet(sql: string, ...params: any[]): Promise<any>;
  dbRun(sql: string, ...params: any[]): Promise<any>;
  requireAuth(req: any, res: any): Promise<VoiceAuth | null>;
  requirePerm(req: any, res: any, perm: string): Promise<VoiceAuth | null>;
  hasPerm(auth: VoiceAuth, perm: string): Promise<boolean>;
  getMemberPerms(memberId: number, teamId: number | null): Promise<Set<string>>;
  memberRoleIds(memberId: number, teamId: number): Promise<number[]>;
  broadcastToTeam(teamId: number, data: any): void;
  sendToMember(teamId: number, memberId: number, data: any): void;
  memberSocketCount(teamId: number, memberId: number): number;
  env: Record<string, string | undefined>;
  nowIso(): string;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable, no I/O)
// ---------------------------------------------------------------------------

export interface ChannelAccess {
  canView: boolean;
  canJoin: boolean;
  canSpeak: boolean;
  canVideo: boolean;
  canScreenshare: boolean;
}

export interface RolePermRow {
  role_id: number;
  can_view: number;
  can_join: number;
  can_speak: number;
  can_video: number;
  can_screenshare: number;
}

/** Resolve what a member may do in a voice channel. */
export function resolveChannelAccess(opts: {
  channel: { is_private: number; allow_video: number; allow_screenshare: number };
  memberRoleIds: number[];
  overrideRows: RolePermRow[];
  videoEnabled: boolean;
  screenshareEnabled: boolean;
  isPrivileged: boolean; // manage_voice / * — bypasses channel ACLs
}): ChannelAccess {
  const { channel, memberRoleIds, overrideRows, isPrivileged } = opts;
  if (isPrivileged) {
    return {
      canView: true,
      canJoin: true,
      canSpeak: true,
      canVideo: Boolean(channel.allow_video && opts.videoEnabled),
      canScreenshare: Boolean(channel.allow_screenshare && opts.screenshareEnabled),
    };
  }
  const rows = overrideRows.filter((r) => memberRoleIds.includes(r.role_id));
  const anyGrant = (key: "can_view" | "can_join" | "can_speak" | "can_video" | "can_screenshare") =>
    rows.some((r) => r[key] === 1);
  const isPrivate = channel.is_private === 1;
  return {
    canView: isPrivate ? anyGrant("can_view") : rows.length === 0 ? true : anyGrant("can_view"),
    canJoin: isPrivate ? anyGrant("can_join") : rows.length === 0 ? true : anyGrant("can_join"),
    canSpeak: rows.length === 0 ? true : anyGrant("can_speak"),
    canVideo: (rows.length === 0 ? true : anyGrant("can_video")) && channel.allow_video === 1 && opts.videoEnabled,
    canScreenshare:
      (rows.length === 0 ? true : anyGrant("can_screenshare")) &&
      channel.allow_screenshare === 1 &&
      opts.screenshareEnabled,
  };
}

/** Normalize a voice channel name the same way text channels are slugged. */
export function sanitizeVoiceChannelName(input: unknown): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function sanitizeDescription(input: unknown): string {
  return String(input || "").trim().slice(0, 200);
}

export function defaultVoiceChannelNames(): string[] {
  return ["Team Meeting", "Strategy", "Drive Practice", "Build Room"];
}

const SIGNAL_KINDS = new Set(["offer", "answer", "ice"]);

/** Validate a client→server signal relay payload. Returns an error string or null. */
export function validateSignalPayload(body: any): string | null {
  if (!body || typeof body !== "object") return "Invalid signal payload";
  const to = parseInt(body.to_member_id, 10);
  if (!Number.isFinite(to) || to <= 0) return "Invalid signal target";
  const p = body.payload;
  if (!p || typeof p !== "object") return "Invalid signal payload";
  if (!SIGNAL_KINDS.has(p.kind)) return "Unknown signal kind";
  if (p.kind === "offer" || p.kind === "answer") {
    if (typeof p.sdp !== "string" || p.sdp.length < 10 || p.sdp.length > 200000) return "Invalid SDP";
  }
  if (p.kind === "ice") {
    if (typeof p.candidate !== "string" || p.candidate.length > 8000) return "Invalid ICE candidate";
  }
  return null;
}

export const MODERATION_ACTIONS = new Set([
  "mute",
  "deafen",
  "remove",
  "move",
  "stop_screen",
  "disable_video",
  "lock",
  "unlock",
  "end",
  "spotlight",
  "unspotlight",
]);

/** Build ICE servers from env. TURN_* is optional; without it calls are STUN-only. */
export function iceServersFromEnv(env: Record<string, string | undefined>): Array<{ urls: string | string[]; username?: string; credential?: string }> {
  const servers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];
  const stun = (env.STUN_URLS || "stun:stun.l.google.com:19302")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (stun.length) servers.push({ urls: stun });
  const turnUrls = (env.TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (turnUrls.length) {
    const entry: { urls: string[]; username?: string; credential?: string } = { urls: turnUrls };
    if (env.TURN_USERNAME) entry.username = env.TURN_USERNAME;
    if (env.TURN_CREDENTIAL) entry.credential = env.TURN_CREDENTIAL;
    servers.push(entry);
  }
  return servers;
}

export function inviteTtlSeconds(env: Record<string, string | undefined>): number {
  const v = parseInt(env.CALL_INVITE_TTL_SECONDS || "60", 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 300) : 60;
}

// ---------------------------------------------------------------------------
// DB helpers (depend on injected db fns)
// ---------------------------------------------------------------------------

export async function ensureVoiceSeeded(deps: VoiceDeps, teamId: number): Promise<void> {
  const { dbGet, dbRun } = deps;
  await dbRun(
    `INSERT OR IGNORE INTO team_voice_settings (team_id) VALUES (?)`,
    teamId
  );
  const existing = (await dbGet("SELECT id FROM voice_channels WHERE team_id = ? LIMIT 1", teamId)) as any;
  if (existing) return;
  const names = defaultVoiceChannelNames();
  for (let i = 0; i < names.length; i++) {
    await dbRun(
      "INSERT INTO voice_channels (team_id, name, position) VALUES (?, ?, ?)",
      teamId,
      names[i],
      i
    );
  }
}

export async function getVoiceSettings(deps: VoiceDeps, teamId: number): Promise<any> {
  await ensureVoiceSeeded(deps, teamId);
  const row = (await deps.dbGet("SELECT * FROM team_voice_settings WHERE team_id = ?", teamId)) as any;
  return (
    row || {
      team_id: teamId,
      video_enabled: 1,
      screenshare_enabled: 1,
      global_spotlight_enabled: 1,
      dm_calls_allowed: 1,
      group_calls_allowed: 1,
      default_max_participants: 0,
      default_video_quality: "medium",
      call_timeout_minutes: 0,
      reconnect_attempts: 5,
    }
  );
}

export async function getChannelAccess(
  deps: VoiceDeps,
  auth: VoiceAuth,
  channel: any
): Promise<{ access: ChannelAccess; privileged: boolean }> {
  const teamId = auth.teamId!;
  const perms = await deps.getMemberPerms(auth.memberId, teamId);
  const privileged = perms.has("*") || perms.has("manage_voice");
  const settings = await getVoiceSettings(deps, teamId);
  const roleIds = await deps.memberRoleIds(auth.memberId, teamId);
  const rows = (await deps.dbAll(
    "SELECT role_id, can_view, can_join, can_speak, can_video, can_screenshare FROM voice_channel_role_perms WHERE channel_id = ?",
    channel.id
  )) as RolePermRow[];
  const access = resolveChannelAccess({
    channel,
    memberRoleIds: roleIds,
    overrideRows: rows,
    videoEnabled: settings.video_enabled === 1,
    screenshareEnabled: settings.screenshare_enabled === 1,
    isPrivileged: privileged,
  });
  return { access, privileged };
}

/** Active (not ended) session for a voice channel, if any. */
export async function activeSessionForChannel(deps: VoiceDeps, teamId: number, channelId: number): Promise<any | null> {
  return (await deps.dbGet(
    "SELECT * FROM call_sessions WHERE team_id = ? AND channel_id = ? AND kind = 'voice_channel' AND ended_at IS NULL ORDER BY id DESC LIMIT 1",
    teamId,
    channelId
  )) as any;
}

/** Currently active session (any kind) the member is in for this team. */
export async function activeSessionForMember(deps: VoiceDeps, teamId: number, memberId: number): Promise<any | null> {
  return (await deps.dbGet(
    `SELECT s.* FROM call_sessions s
     JOIN call_participants p ON p.session_id = s.id
     WHERE s.team_id = ? AND s.ended_at IS NULL AND p.member_id = ? AND p.left_at IS NULL
     ORDER BY s.id DESC LIMIT 1`,
    teamId,
    memberId
  )) as any;
}

export async function sessionParticipants(deps: VoiceDeps, sessionId: number): Promise<any[]> {
  return (await deps.dbAll(
    `SELECT p.*, m.name, m.avatar_url, m.status AS member_status
     FROM call_participants p
     JOIN members m ON m.id = p.member_id
     WHERE p.session_id = ? AND p.left_at IS NULL
     ORDER BY p.joined_at ASC`,
    sessionId
  )) as any[];
}

export async function sessionParticipantCount(deps: VoiceDeps, sessionId: number): Promise<number> {
  const row = (await deps.dbGet(
    "SELECT COUNT(*) AS n FROM call_participants WHERE session_id = ? AND left_at IS NULL",
    sessionId
  )) as any;
  return row?.n ?? 0;
}

function presencePayload(session: any, participants: any[]): any {
  return {
    type: "voice:presence",
    session_id: session.id,
    channel_id: session.channel_id,
    kind: session.kind,
    locked: session.locked === 1,
    global_spotlight_member_id: session.global_spotlight_member_id,
    participants: participants.map((p) => ({
      member_id: p.member_id,
      name: p.name,
      avatar_url: p.avatar_url || null,
      is_muted: p.is_muted === 1,
      is_deafened: p.is_deafened === 1,
      camera_on: p.camera_on === 1,
      sharing_screen: p.sharing_screen === 1,
      connection_state: p.connection_state || "connected",
      joined_at: p.joined_at,
    })),
  };
}

export async function broadcastPresence(deps: VoiceDeps, session: any): Promise<void> {
  const participants = await sessionParticipants(deps, session.id);
  deps.broadcastToTeam(session.team_id, presencePayload(session, participants));
}

/** Close a member's open participant rows; end sessions left empty. Returns ended sessions. */
export async function removeParticipantEverywhere(
  deps: VoiceDeps,
  teamId: number,
  memberId: number,
  reason: string
): Promise<any[]> {
  const ended: any[] = [];
  const open = (await deps.dbAll(
    `SELECT p.session_id, s.* FROM call_participants p
     JOIN call_sessions s ON s.id = p.session_id
     WHERE s.team_id = ? AND p.member_id = ? AND p.left_at IS NULL AND s.ended_at IS NULL`,
    teamId,
    memberId
  )) as any[];
  for (const row of open) {
    await deps.dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL", deps.nowIso(), row.session_id, memberId);
    const remaining = await sessionParticipantCount(deps, row.session_id);
    if (remaining === 0) {
      await deps.dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), row.session_id);
      ended.push(row);
      deps.broadcastToTeam(teamId, { type: "voice:session-ended", session_id: row.session_id, reason });
    } else {
      const session = (await deps.dbGet("SELECT * FROM call_sessions WHERE id = ?", row.session_id)) as any;
      if (session) await broadcastPresence(deps, session);
    }
  }
  if (reason === "disconnect" || reason === "removed") {
    // Let the removed/disconnected member's own client know it should tear down.
    deps.sendToMember(teamId, memberId, { type: "voice:kicked", reason });
  }
  return ended;
}

async function logModeration(
  deps: VoiceDeps,
  teamId: number,
  sessionId: number | null,
  actorId: number,
  targetId: number | null,
  action: string,
  detail: string
): Promise<void> {
  await deps.dbRun(
    "INSERT INTO call_moderation_log (session_id, team_id, actor_id, target_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)",
    sessionId,
    teamId,
    actorId,
    targetId,
    action,
    detail || ""
  );
}

/** Expire stale ringing invites (lazy; also called by a periodic sweep). */
export async function expireStaleInvites(deps: VoiceDeps, teamId: number): Promise<void> {
  const ttl = inviteTtlSeconds(deps.env);
  await deps.dbRun(
    `UPDATE call_invites SET status = 'expired' WHERE status = 'ringing'
     AND session_id IN (SELECT id FROM call_sessions WHERE team_id = ?)
     AND (strftime('%s','now') - strftime('%s', created_at)) > ?`,
    teamId,
    ttl
  );
}

// ---------------------------------------------------------------------------
// REST routes
// ---------------------------------------------------------------------------

export function registerVoiceRoutes(app: any, deps: VoiceDeps): void {
  const { dbAll, dbGet, dbRun } = deps;

  // ---- Voice channels ----
  app.get("/api/voice/channels", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    await ensureVoiceSeeded(deps, auth.teamId);
    const channels = (await dbAll(
      "SELECT * FROM voice_channels WHERE team_id = ? ORDER BY position ASC, id ASC",
      auth.teamId
    )) as any[];
    const out: any[] = [];
    for (const ch of channels) {
      const { access } = await getChannelAccess(deps, auth, ch);
      if (!access.canView) continue;
      const session = await activeSessionForChannel(deps, auth.teamId, ch.id);
      const participants = session ? await sessionParticipants(deps, session.id) : [];
      out.push({
        ...ch,
        session_id: session?.id ?? null,
        participant_count: participants.length,
        participants: participants.map((p) => ({
          member_id: p.member_id,
          name: p.name,
          avatar_url: p.avatar_url || null,
          is_muted: p.is_muted === 1,
          is_deafened: p.is_deafened === 1,
          camera_on: p.camera_on === 1,
          sharing_screen: p.sharing_screen === 1,
        })),
      });
    }
    res.json({ channels: out });
  });

  app.post("/api/voice/channels", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    await ensureVoiceSeeded(deps, auth.teamId);
    const name = sanitizeVoiceChannelName(req.body?.name);
    if (!name) return res.status(400).json({ error: "Channel name can't be empty" });
    const description = sanitizeDescription(req.body?.description);
    const maxParticipants = Math.max(0, Math.min(100, parseInt(req.body?.max_participants, 10) || 0));
    const isPrivate = req.body?.is_private ? 1 : 0;
    const allowVideo = req.body?.allow_video === false ? 0 : 1;
    const allowScreenshare = req.body?.allow_screenshare === false ? 0 : 1;
    let categoryId: number | null = parseInt(req.body?.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId != null) {
      const cat = (await dbGet("SELECT id FROM channel_categories WHERE id = ? AND team_id = ?", categoryId, auth.teamId)) as any;
      if (!cat) return res.status(400).json({ error: "Category not found" });
    }
    try {
      const posRow = (await dbGet("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM voice_channels WHERE team_id = ?", auth.teamId)) as any;
      const info = await dbRun(
        "INSERT INTO voice_channels (team_id, name, description, category_id, position, max_participants, is_private, allow_video, allow_screenshare, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        auth.teamId, name, description, categoryId, posRow?.p ?? 0, maxParticipants, isPrivate, allowVideo, allowScreenshare, auth.memberId
      );
      const channel = await dbGet("SELECT * FROM voice_channels WHERE id = ?", info.lastInsertRowid);
      deps.broadcastToTeam(auth.teamId, { type: "voice:channel-created", channel });
      res.json({ channel });
    } catch (e: any) {
      if (String(e?.message || "").includes("UNIQUE")) return res.status(409).json({ error: "A voice channel with that name already exists" });
      throw e;
    }
  });

  app.patch("/api/voice/channels/:id", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM voice_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Voice channel not found" });
    const updates: string[] = [];
    const params: any[] = [];
    if (req.body?.name !== undefined) {
      const name = sanitizeVoiceChannelName(req.body.name);
      if (!name) return res.status(400).json({ error: "Channel name can't be empty" });
      updates.push("name = ?"); params.push(name);
    }
    if (req.body?.description !== undefined) { updates.push("description = ?"); params.push(sanitizeDescription(req.body.description)); }
    if (req.body?.max_participants !== undefined) { updates.push("max_participants = ?"); params.push(Math.max(0, Math.min(100, parseInt(req.body.max_participants, 10) || 0))); }
    if (req.body?.is_private !== undefined) { updates.push("is_private = ?"); params.push(req.body.is_private ? 1 : 0); }
    if (req.body?.locked !== undefined) { updates.push("locked = ?"); params.push(req.body.locked ? 1 : 0); }
    if (req.body?.allow_video !== undefined) { updates.push("allow_video = ?"); params.push(req.body.allow_video ? 1 : 0); }
    if (req.body?.allow_screenshare !== undefined) { updates.push("allow_screenshare = ?"); params.push(req.body.allow_screenshare ? 1 : 0); }
    if (req.body?.category_id !== undefined) {
      let categoryId: number | null = parseInt(req.body.category_id, 10);
      if (!Number.isFinite(categoryId)) categoryId = null;
      if (categoryId != null) {
        const cat = (await dbGet("SELECT id FROM channel_categories WHERE id = ? AND team_id = ?", categoryId, auth.teamId)) as any;
        if (!cat) return res.status(400).json({ error: "Category not found" });
      }
      updates.push("category_id = ?"); params.push(categoryId);
    }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    try {
      await dbRun(`UPDATE voice_channels SET ${updates.join(", ")} WHERE id = ?`, ...params, id);
    } catch (e: any) {
      if (String(e?.message || "").includes("UNIQUE")) return res.status(409).json({ error: "A voice channel with that name already exists" });
      throw e;
    }
    const updated = await dbGet("SELECT * FROM voice_channels WHERE id = ?", id);
    deps.broadcastToTeam(auth.teamId, { type: "voice:channel-updated", channel: updated });
    res.json({ channel: updated });
  });

  app.delete("/api/voice/channels/:id", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM voice_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Voice channel not found" });
    // End any active session first so participants get a clean teardown.
    const session = await activeSessionForChannel(deps, auth.teamId, id);
    if (session) {
      const parts = await sessionParticipants(deps, session.id);
      await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND left_at IS NULL", deps.nowIso(), session.id);
      await dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), session.id);
      for (const p of parts) deps.sendToMember(auth.teamId, p.member_id, { type: "voice:kicked", reason: "channel_deleted" });
      deps.broadcastToTeam(auth.teamId, { type: "voice:session-ended", session_id: session.id, reason: "channel_deleted" });
    }
    await dbRun("DELETE FROM voice_channels WHERE id = ?", id);
    deps.broadcastToTeam(auth.teamId, { type: "voice:channel-deleted", channel_id: id });
    res.json({ ok: true });
  });

  app.post("/api/voice/channels/reorder", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    const order = req.body?.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array of channel ids" });
    for (let i = 0; i < order.length; i++) {
      const id = parseInt(order[i], 10);
      if (!Number.isFinite(id)) continue;
      await dbRun("UPDATE voice_channels SET position = ? WHERE id = ? AND team_id = ?", i, id, auth.teamId);
    }
    const channels = await dbAll("SELECT * FROM voice_channels WHERE team_id = ? ORDER BY position ASC, id ASC", auth.teamId);
    deps.broadcastToTeam(auth.teamId, { type: "voice:channels-reordered", channels });
    res.json({ channels });
  });

  app.get("/api/voice/channels/:id/role-perms", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT id FROM voice_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Voice channel not found" });
    const rows = await dbAll("SELECT * FROM voice_channel_role_perms WHERE channel_id = ?", id);
    res.json({ perms: rows });
  });

  app.put("/api/voice/channels/:id/role-perms", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM voice_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Voice channel not found" });
    const perms = req.body?.perms;
    if (!Array.isArray(perms)) return res.status(400).json({ error: "perms must be an array" });
    await dbRun("DELETE FROM voice_channel_role_perms WHERE channel_id = ?", id);
    for (const p of perms) {
      const roleId = parseInt(p.role_id, 10);
      if (!Number.isFinite(roleId)) continue;
      const role = (await dbGet("SELECT id FROM roles WHERE id = ? AND team_id = ?", roleId, auth.teamId)) as any;
      if (!role) continue;
      const bit = (v: any) => (v ? 1 : 0);
      await dbRun(
        "INSERT INTO voice_channel_role_perms (channel_id, role_id, can_view, can_join, can_speak, can_video, can_screenshare) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id, roleId, bit(p.can_view), bit(p.can_join), bit(p.can_speak), bit(p.can_video), bit(p.can_screenshare)
      );
    }
    const rows = await dbAll("SELECT * FROM voice_channel_role_perms WHERE channel_id = ?", id);
    deps.broadcastToTeam(auth.teamId, { type: "voice:channel-updated", channel });
    res.json({ perms: rows });
  });

  // ---- Join / leave ----
  app.post("/api/voice/channels/:id/join", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    await ensureVoiceSeeded(deps, auth.teamId);
    const id = parseInt(req.params.id, 10);
    const channel = (await dbGet("SELECT * FROM voice_channels WHERE id = ? AND team_id = ?", id, auth.teamId)) as any;
    if (!channel) return res.status(404).json({ error: "Voice channel not found" });
    const { access, privileged } = await getChannelAccess(deps, auth, channel);
    if (!access.canJoin) return res.status(403).json({ error: "You don't have permission to join this voice channel" });
    if (channel.locked === 1 && !privileged) return res.status(403).json({ error: "This voice channel is locked" });
    const settings = await getVoiceSettings(deps, auth.teamId);
    const cap = channel.max_participants > 0 ? channel.max_participants : settings.default_max_participants;
    let session = await activeSessionForChannel(deps, auth.teamId, id);
    const count = session ? await sessionParticipantCount(deps, session.id) : 0;
    if (cap > 0 && count >= cap && !privileged) return res.status(403).json({ error: "This voice channel is full" });
    const existing = await activeSessionForMember(deps, auth.teamId, auth.memberId);
    if (existing && existing.id !== session?.id) {
      return res.status(409).json({ error: "You're already in another call", session_id: existing.id });
    }
    if (!session) {
      const info = await dbRun(
        "INSERT INTO call_sessions (team_id, kind, channel_id, name, created_by, max_participants) VALUES (?, 'voice_channel', ?, ?, ?, ?)",
        auth.teamId, id, channel.name, auth.memberId, cap
      );
      session = await dbGet("SELECT * FROM call_sessions WHERE id = ?", info.lastInsertRowid);
    }
    // Close any stale open rows for this member in this session, then join.
    await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL", deps.nowIso(), session.id, auth.memberId);
    await dbRun("INSERT INTO call_participants (session_id, member_id) VALUES (?, ?)", session.id, auth.memberId);
    await broadcastPresence(deps, session);
    const participants = await sessionParticipants(deps, session.id);
    res.json({ session: { ...session, participants: presencePayload(session, participants).participants }, ice: iceServersFromEnv(deps.env) });
  });

  app.post("/api/voice/leave", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    await removeParticipantEverywhere(deps, auth.teamId, auth.memberId, "leave");
    res.json({ ok: true });
  });

  // ---- Moderation (server-validated; clients enforce via voice:moderated) ----
  app.post("/api/voice/moderate", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    if (!(await deps.hasPerm(auth, "moderate_calls")) && !(await deps.hasPerm(auth, "manage_voice"))) {
      return res.status(403).json({ error: "You don't have permission to moderate calls" });
    }
    const action = String(req.body?.action || "");
    if (!MODERATION_ACTIONS.has(action)) return res.status(400).json({ error: "Unknown moderation action" });
    const sessionId = parseInt(req.body?.session_id, 10);
    const session = Number.isFinite(sessionId)
      ? ((await dbGet("SELECT * FROM call_sessions WHERE id = ? AND team_id = ? AND ended_at IS NULL", sessionId, auth.teamId)) as any)
      : null;
    if (!session) return res.status(404).json({ error: "Call session not found" });
    const targetId = parseInt(req.body?.target_member_id, 10);
    const target = Number.isFinite(targetId)
      ? ((await dbGet(
          "SELECT p.*, m.name FROM call_participants p JOIN members m ON m.id = p.member_id WHERE p.session_id = ? AND p.member_id = ? AND p.left_at IS NULL",
          session.id, targetId
        )) as any)
      : null;
    const actorName = ((await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any)?.name || "A moderator";

    const notifySession = (data: any) => deps.broadcastToTeam(auth.teamId!, { type: "voice:moderated", session_id: session.id, ...data });

    switch (action) {
      case "mute":
      case "deafen":
      case "disable_video":
      case "stop_screen": {
        if (!target) return res.status(404).json({ error: "Participant is not in this call" });
        if (target.member_id === auth.memberId) return res.status(400).json({ error: "That action targets other participants" });
        const col = action === "mute" ? "is_muted" : action === "deafen" ? "is_deafened" : action === "disable_video" ? "camera_on" : "sharing_screen";
        const val = action === "mute" || action === "deafen" ? 1 : 0;
        await dbRun(`UPDATE call_participants SET ${col} = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL`, val, session.id, target.member_id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, target.member_id, action, "");
        notifySession({ action, target_member_id: target.member_id, actor_name: actorName });
        await broadcastPresence(deps, session);
        return res.json({ ok: true });
      }
      case "remove": {
        if (!target) return res.status(404).json({ error: "Participant is not in this call" });
        if (target.member_id === auth.memberId) return res.status(400).json({ error: "You can't remove yourself this way — just leave" });
        await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL", deps.nowIso(), session.id, target.member_id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, target.member_id, action, String(req.body?.reason || "").slice(0, 200));
        deps.sendToMember(auth.teamId, target.member_id, { type: "voice:kicked", reason: "removed", session_id: session.id });
        notifySession({ action, target_member_id: target.member_id, actor_name: actorName });
        const remaining = await sessionParticipantCount(deps, session.id);
        if (remaining === 0) {
          await dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), session.id);
          deps.broadcastToTeam(auth.teamId, { type: "voice:session-ended", session_id: session.id, reason: "empty" });
        } else {
          await broadcastPresence(deps, session);
        }
        return res.json({ ok: true });
      }
      case "move": {
        if (!target) return res.status(404).json({ error: "Participant is not in this call" });
        const toChannelId = parseInt(req.body?.target_channel_id, 10);
        const toChannel = Number.isFinite(toChannelId)
          ? ((await dbGet("SELECT * FROM voice_channels WHERE id = ? AND team_id = ?", toChannelId, auth.teamId)) as any)
          : null;
        if (!toChannel) return res.status(400).json({ error: "Destination voice channel not found" });
        // The moved member must be allowed to join the destination.
        const targetAuth: VoiceAuth = { memberId: target.member_id, teamId: auth.teamId, accountType: "" };
        const { access } = await getChannelAccess(deps, targetAuth, toChannel);
        if (!access.canJoin) return res.status(403).json({ error: "That member can't join the destination channel" });
        await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL", deps.nowIso(), session.id, target.member_id);
        let dest = await activeSessionForChannel(deps, auth.teamId, toChannelId);
        if (!dest) {
          const info = await dbRun(
            "INSERT INTO call_sessions (team_id, kind, channel_id, name, created_by) VALUES (?, 'voice_channel', ?, ?, ?)",
            auth.teamId, toChannelId, toChannel.name, auth.memberId
          );
          dest = await dbGet("SELECT * FROM call_sessions WHERE id = ?", info.lastInsertRowid);
        }
        await dbRun("INSERT INTO call_participants (session_id, member_id) VALUES (?, ?)", dest.id, target.member_id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, target.member_id, action, `moved to ${toChannel.name}`);
        deps.sendToMember(auth.teamId, target.member_id, { type: "voice:moved", session_id: dest.id, channel_id: toChannelId });
        notifySession({ action, target_member_id: target.member_id, actor_name: actorName, target_channel_id: toChannelId });
        await broadcastPresence(deps, session);
        await broadcastPresence(deps, dest);
        return res.json({ ok: true, session_id: dest.id });
      }
      case "lock":
      case "unlock": {
        await dbRun("UPDATE call_sessions SET locked = ? WHERE id = ?", action === "lock" ? 1 : 0, session.id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, null, action, "");
        notifySession({ action, actor_name: actorName });
        const updated = await dbGet("SELECT * FROM call_sessions WHERE id = ?", session.id);
        await broadcastPresence(deps, updated);
        return res.json({ ok: true });
      }
      case "end": {
        await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND left_at IS NULL", deps.nowIso(), session.id);
        await dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), session.id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, null, action, "");
        deps.broadcastToTeam(auth.teamId, { type: "voice:session-ended", session_id: session.id, reason: "ended_by_moderator", actor_name: actorName });
        return res.json({ ok: true });
      }
      case "spotlight":
      case "unspotlight": {
        const settings = await getVoiceSettings(deps, auth.teamId);
        if (settings.global_spotlight_enabled !== 1) return res.status(403).json({ error: "Global spotlight is disabled for this team" });
        const spotId = action === "spotlight" ? (Number.isFinite(targetId) ? targetId : null) : null;
        if (action === "spotlight" && !target) return res.status(404).json({ error: "Participant is not in this call" });
        await dbRun("UPDATE call_sessions SET global_spotlight_member_id = ? WHERE id = ?", spotId, session.id);
        await logModeration(deps, auth.teamId, session.id, auth.memberId, spotId, action, "");
        deps.broadcastToTeam(auth.teamId, { type: "voice:spotlight", session_id: session.id, target_member_id: spotId, scope: "global" });
        const updated = await dbGet("SELECT * FROM call_sessions WHERE id = ?", session.id);
        await broadcastPresence(deps, updated);
        return res.json({ ok: true });
      }
    }
    return res.status(400).json({ error: "Unhandled action" });
  });

  // ---- DM / group calls ----
  app.post("/api/voice/calls", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    const kind = req.body?.kind === "group" ? "group" : "dm";
    const media = req.body?.media === "video" ? "video" : "audio";
    const settings = await getVoiceSettings(deps, auth.teamId);
    if (kind === "dm" && settings.dm_calls_allowed !== 1) return res.status(403).json({ error: "Direct calls are disabled for this team" });
    if (kind === "group" && settings.group_calls_allowed !== 1) return res.status(403).json({ error: "Group calls are disabled for this team" });
    const rawIds = Array.isArray(req.body?.invitee_ids) ? req.body.invitee_ids : [];
    const inviteeIds = [...new Set(rawIds.map((v: any) => parseInt(v, 10)).filter((n: number) => Number.isFinite(n) && n > 0 && n !== auth.memberId))];
    if (kind === "dm" && inviteeIds.length !== 1) return res.status(400).json({ error: "Direct calls need exactly one other person" });
    if (!inviteeIds.length) return res.status(400).json({ error: "Invite at least one person" });
    if (inviteeIds.length > 24) return res.status(400).json({ error: "Too many invitees (max 24)" });
    // Every invitee must be an active member of this team — never trust client IDs.
    const placeholders = inviteeIds.map(() => "?").join(",");
    const members = (await dbAll(
      `SELECT id, name FROM members WHERE id IN (${placeholders}) AND team_id = ? AND COALESCE(is_active, 1) = 1`,
      ...inviteeIds,
      auth.teamId
    )) as any[];
    if (members.length !== inviteeIds.length) return res.status(400).json({ error: "One or more invitees are not on this team" });
    const alreadyIn = await activeSessionForMember(deps, auth.teamId, auth.memberId);
    if (alreadyIn) return res.status(409).json({ error: "You're already in another call", session_id: alreadyIn.id });
    const inviterName = ((await dbGet("SELECT name FROM members WHERE id = ?", auth.memberId)) as any)?.name || "Someone";
    const info = await dbRun(
      "INSERT INTO call_sessions (team_id, kind, name, created_by) VALUES (?, ?, ?, ?)",
      auth.teamId, kind, kind === "dm" ? `Call with ${members[0].name}` : `Group call`, auth.memberId
    );
    const session = await dbGet("SELECT * FROM call_sessions WHERE id = ?", info.lastInsertRowid);
    await dbRun("INSERT INTO call_participants (session_id, member_id) VALUES (?, ?)", session.id, auth.memberId);
    const invites: any[] = [];
    for (const m of members) {
      const inv = await dbRun(
        "INSERT INTO call_invites (session_id, inviter_id, invitee_id, media) VALUES (?, ?, ?, ?)",
        session.id, auth.memberId, m.id, media
      );
      invites.push({ id: inv.lastInsertRowid, invitee_id: m.id });
      deps.sendToMember(auth.teamId, m.id, {
        type: "voice:incoming",
        invite_id: inv.lastInsertRowid,
        session_id: session.id,
        kind,
        media,
        inviter: { id: auth.memberId, name: inviterName },
      });
    }
    await broadcastPresence(deps, session);
    res.json({ session_id: session.id, invites, ice: iceServersFromEnv(deps.env) });
  });

  app.post("/api/voice/calls/:id/accept", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    await expireStaleInvites(deps, auth.teamId);
    const sessionId = parseInt(req.params.id, 10);
    const invite = (await dbGet(
      `SELECT * FROM call_invites WHERE session_id = ? AND invitee_id = ? AND status = 'ringing'
       AND session_id IN (SELECT id FROM call_sessions WHERE team_id = ? AND ended_at IS NULL)`,
      sessionId, auth.memberId, auth.teamId
    )) as any;
    if (!invite) return res.status(404).json({ error: "Invite not found or expired" });
    const alreadyIn = await activeSessionForMember(deps, auth.teamId, auth.memberId);
    if (alreadyIn && alreadyIn.id !== sessionId) {
      return res.status(409).json({ error: "You're already in another call", session_id: alreadyIn.id });
    }
    await dbRun("UPDATE call_invites SET status = 'accepted', responded_at = ? WHERE id = ?", deps.nowIso(), invite.id);
    await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND member_id = ? AND left_at IS NULL", deps.nowIso(), sessionId, auth.memberId);
    await dbRun("INSERT INTO call_participants (session_id, member_id) VALUES (?, ?)", sessionId, auth.memberId);
    deps.sendToMember(auth.teamId, invite.inviter_id, { type: "voice:invite-accepted", session_id: sessionId, member_id: auth.memberId });
    const session = await dbGet("SELECT * FROM call_sessions WHERE id = ?", sessionId);
    await broadcastPresence(deps, session);
    res.json({ ok: true, ice: iceServersFromEnv(deps.env) });
  });

  app.post("/api/voice/calls/:id/decline", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    const sessionId = parseInt(req.params.id, 10);
    const invite = (await dbGet("SELECT * FROM call_invites WHERE session_id = ? AND invitee_id = ? AND status = 'ringing'", sessionId, auth.memberId)) as any;
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    await dbRun("UPDATE call_invites SET status = 'declined', responded_at = ? WHERE id = ?", deps.nowIso(), invite.id);
    deps.sendToMember(auth.teamId, invite.inviter_id, { type: "voice:invite-declined", session_id: sessionId, member_id: auth.memberId });
    // If nobody ever joined, end the stillborn session.
    const count = await sessionParticipantCount(deps, sessionId);
    if (count <= 1) {
      await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND left_at IS NULL", deps.nowIso(), sessionId);
      await dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), sessionId);
      deps.broadcastToTeam(auth.teamId, { type: "voice:session-ended", session_id: sessionId, reason: "declined" });
    }
    res.json({ ok: true });
  });

  app.post("/api/voice/calls/:id/end", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    const sessionId = parseInt(req.params.id, 10);
    const session = (await dbGet("SELECT * FROM call_sessions WHERE id = ? AND team_id = ? AND ended_at IS NULL", sessionId, auth.teamId)) as any;
    if (!session) return res.status(404).json({ error: "Call not found" });
    const isParticipant = (await dbGet("SELECT id FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL", sessionId, auth.memberId)) as any;
    const canModerate = (await deps.hasPerm(auth, "moderate_calls")) || (await deps.hasPerm(auth, "manage_voice"));
    if (!isParticipant && !canModerate) return res.status(403).json({ error: "You're not in this call" });
    await dbRun("UPDATE call_invites SET status = 'cancelled' WHERE session_id = ? AND status = 'ringing'", sessionId);
    await removeParticipantEverywhere(deps, auth.teamId, auth.memberId, "leave");
    // Ending a DM/group call ends it for everyone still in it.
    if (session.kind !== "voice_channel") {
      const rest = (await dbAll("SELECT member_id FROM call_participants WHERE session_id = ? AND left_at IS NULL", sessionId)) as any[];
      for (const r of rest) deps.sendToMember(auth.teamId, r.member_id, { type: "voice:kicked", reason: "call_ended", session_id: sessionId });
      await dbRun("UPDATE call_participants SET left_at = ? WHERE session_id = ? AND left_at IS NULL", deps.nowIso(), sessionId);
      await dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), sessionId);
      deps.broadcastToTeam(auth.teamId, { type: "voice:session-ended", session_id: sessionId, reason: "ended" });
    }
    res.json({ ok: true });
  });

  // ---- Settings & ICE ----
  app.get("/api/voice/settings", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth || auth.teamId == null) return;
    res.json({ settings: await getVoiceSettings(deps, auth.teamId) });
  });

  app.put("/api/voice/settings", async (req: any, res: any) => {
    const auth = await deps.requirePerm(req, res, "manage_voice");
    if (!auth || auth.teamId == null) return;
    await ensureVoiceSeeded(deps, auth.teamId);
    const bit = (v: any, fallback: number) => (v === undefined ? fallback : v ? 1 : 0);
    const cur = await getVoiceSettings(deps, auth.teamId);
    const quality = ["low", "medium", "high"].includes(req.body?.default_video_quality) ? req.body.default_video_quality : cur.default_video_quality;
    await dbRun(
      `UPDATE team_voice_settings SET video_enabled = ?, screenshare_enabled = ?, global_spotlight_enabled = ?,
       dm_calls_allowed = ?, group_calls_allowed = ?, default_max_participants = ?, default_video_quality = ?,
       call_timeout_minutes = ?, reconnect_attempts = ? WHERE team_id = ?`,
      bit(req.body?.video_enabled, cur.video_enabled),
      bit(req.body?.screenshare_enabled, cur.screenshare_enabled),
      bit(req.body?.global_spotlight_enabled, cur.global_spotlight_enabled),
      bit(req.body?.dm_calls_allowed, cur.dm_calls_allowed),
      bit(req.body?.group_calls_allowed, cur.group_calls_allowed),
      Math.max(0, Math.min(100, parseInt(req.body?.default_max_participants, 10) || 0)),
      quality,
      Math.max(0, Math.min(480, parseInt(req.body?.call_timeout_minutes, 10) || 0)),
      Math.max(0, Math.min(20, parseInt(req.body?.reconnect_attempts, 10) || 5)),
      auth.teamId
    );
    res.json({ settings: await getVoiceSettings(deps, auth.teamId) });
  });

  app.get("/api/voice/ice", async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth) return;
    res.json({ iceServers: iceServersFromEnv(deps.env) });
  });
}

// ---------------------------------------------------------------------------
// WebSocket signaling — called from server.ts's wss message handler.
// Relays SDP/ICE between two verified participants of the same live session.
// ---------------------------------------------------------------------------

export async function handleVoiceWSMessage(ws: any, message: any, deps: VoiceDeps): Promise<boolean> {
  const teamId: number | null | undefined = ws.teamId;
  const memberId: number | null | undefined = ws.memberId;
  if (teamId == null || memberId == null) return true; // unidentified socket: swallow
  const type = message.type;

  if (type === "voice:signal") {
    const err = validateSignalPayload(message);
    if (err) { try { ws.send(JSON.stringify({ type: "voice:error", error: err })); } catch {} return true; }
    const toMemberId = parseInt(message.to_member_id, 10);
    // Both sides must be live participants of the SAME session. Never trust
    // the client about which session that is — derive it from the sender.
    const senderSession = await activeSessionForMember(deps, teamId, memberId);
    if (!senderSession) return true;
    const target = (await deps.dbGet(
      "SELECT id FROM call_participants WHERE session_id = ? AND member_id = ? AND left_at IS NULL",
      senderSession.id, toMemberId
    )) as any;
    if (!target) return true;
    deps.sendToMember(teamId, toMemberId, {
      type: "voice:signal",
      from_member_id: memberId,
      session_id: senderSession.id,
      payload: message.payload,
    });
    return true;
  }

  if (type === "voice:state") {
    const session = await activeSessionForMember(deps, teamId, memberId);
    if (!session) return true;
    const patch: Record<string, number> = {};
    if (message.is_muted !== undefined) patch.is_muted = message.is_muted ? 1 : 0;
    if (message.is_deafened !== undefined) patch.is_deafened = message.is_deafened ? 1 : 0;
    if (message.camera_on !== undefined) patch.camera_on = message.camera_on ? 1 : 0;
    if (message.sharing_screen !== undefined) patch.sharing_screen = message.sharing_screen ? 1 : 0;
    if (message.connection_state !== undefined && ["connected", "connecting", "reconnecting", "failed"].includes(message.connection_state)) {
      patch.connection_state = message.connection_state;
    }
    const keys = Object.keys(patch);
    if (keys.length) {
      await deps.dbRun(
        `UPDATE call_participants SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE session_id = ? AND member_id = ? AND left_at IS NULL`,
        ...keys.map((k) => patch[k]), session.id, memberId
      );
      deps.broadcastToTeam(teamId, { type: "voice:state", session_id: session.id, member_id: memberId, state: patch });
    }
    return true;
  }

  if (type === "voice:leave") {
    await removeParticipantEverywhere(deps, teamId, memberId, "leave");
    return true;
  }

  if (type === "voice:ring-cancel") {
    const sessionId = parseInt(message.session_id, 10);
    if (!Number.isFinite(sessionId)) return true;
    const session = (await deps.dbGet("SELECT * FROM call_sessions WHERE id = ? AND team_id = ? AND created_by = ? AND ended_at IS NULL", sessionId, teamId, memberId)) as any;
    if (!session) return true;
    await deps.dbRun("UPDATE call_invites SET status = 'cancelled' WHERE session_id = ? AND status = 'ringing'", sessionId);
    const invitees = (await deps.dbAll("SELECT invitee_id FROM call_invites WHERE session_id = ?", sessionId)) as any[];
    for (const r of invitees) deps.sendToMember(teamId, r.invitee_id, { type: "voice:ring-cancelled", session_id: sessionId });
    return true;
  }

  return false;
}

/** Periodic maintenance: expire invites, end sessions with no live members. */
export async function voiceMaintenance(deps: VoiceDeps, teamId: number): Promise<void> {
  try {
    await expireStaleInvites(deps, teamId);
    const zombies = (await deps.dbAll(
      `SELECT s.id FROM call_sessions s
       WHERE s.team_id = ? AND s.ended_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM call_participants p WHERE p.session_id = s.id AND p.left_at IS NULL)`,
      teamId
    )) as any[];
    for (const z of zombies) {
      await deps.dbRun("UPDATE call_sessions SET ended_at = ? WHERE id = ?", deps.nowIso(), z.id);
      deps.broadcastToTeam(teamId, { type: "voice:session-ended", session_id: z.id, reason: "empty" });
    }
  } catch (e) {
    console.error("voiceMaintenance failed:", e);
  }
}
