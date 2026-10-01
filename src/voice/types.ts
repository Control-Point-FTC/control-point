// Shared voice-call types + pure helpers for the Control Point voice engine.
//
// Everything in this module is UI-agnostic and side-effect free: the WebRTC
// layer (webrtc.ts) and the React context (VoiceContext.tsx) both build on
// these types. The pure helpers at the bottom exist so call logic can be
// unit-tested without real media devices.

/** Per-participant quality bucket derived from RTC stats. */
export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

/** Lifecycle of the local client's call session. */
export type ConnectionStatus =
  | 'idle'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

/** Kind of signal payload relayed over the websocket (matches server validation). */
export type SignalKind = 'offer' | 'answer' | 'ice';

export interface OfferSignalPayload {
  kind: 'offer';
  sdp: string;
  /** 'offer' — the RTCSessionDescription type, sent explicitly so the receiver doesn't have to guess. */
  type: 'offer';
}

export interface AnswerSignalPayload {
  kind: 'answer';
  sdp: string;
  type: 'answer';
}

export interface IceSignalPayload {
  kind: 'ice';
  /** JSON-stringified RTCIceCandidateInit, or empty string for end-of-candidates. */
  candidate: string;
}

export type SignalPayload = OfferSignalPayload | AnswerSignalPayload | IceSignalPayload;

export interface VoiceParticipant {
  memberId: number;
  name: string;
  avatarUrl: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  cameraOn: boolean;
  sharingScreen: boolean;
  /** Locally-computed from the WebAudio analyser; never sent to the server. */
  speaking: boolean;
  connectionQuality: ConnectionQuality;
  /** Remote MediaStream assembled from the RTCPeerConnection's tracks. */
  stream?: MediaStream;
  /** Remote screen-share stream (second video track), when sharing. */
  screenStream?: MediaStream;
  isSelf: boolean;
  joinedAt?: string;
}

export interface VoiceSessionInfo {
  id: number;
  kind: 'voice_channel' | 'dm' | 'group';
  channelId: number | null;
  name: string;
  locked: boolean;
  globalSpotlightMemberId: number | null;
}

export interface VoiceChannelSummary {
  id: number;
  name: string;
  description: string;
  maxParticipants: number;
  locked: boolean;
  sessionId: number | null;
  participantCount: number;
  participants: Array<{
    memberId: number;
    name: string;
    avatarUrl: string | null;
    isMuted: boolean;
    isDeafened: boolean;
    cameraOn: boolean;
    sharingScreen: boolean;
  }>;
}

export interface DevicePrefs {
  micId?: string;
  cameraId?: string;
  speakerId?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  micVolume: number; // 0..1
  speakerVolume: number; // 0..1
}

export interface IncomingCall {
  inviteId: number;
  sessionId: number;
  kind: 'dm' | 'group';
  media: 'audio' | 'video';
  inviter: { id: number; name: string };
}

/** Raw presence participant as sent by the server (snake_case). */
export interface RawPresenceParticipant {
  member_id: number;
  name: string;
  avatar_url: string | null;
  is_muted: boolean;
  is_deafened: boolean;
  camera_on: boolean;
  sharing_screen: boolean;
  connection_state?: string;
  joined_at?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Glare avoidance: in the full-mesh topology the peer with the HIGHER
 * member id creates the offer when a new remote participant appears; the
 * peer with the LOWER member id is the "polite" peer and waits for the offer.
 * This is deterministic and symmetric, so both sides agree without signaling.
 */
export function shouldCreateOffer(selfMemberId: number, remoteMemberId: number): boolean {
  return selfMemberId > remoteMemberId;
}

/**
 * Client-side mirror of the server's signal validation (server/voice.ts
 * `validateSignalPayload`). Returns an error string or null when valid.
 * Signals are never trusted blindly — a malformed payload is dropped and
 * surfaced as a voice:error instead of crashing the peer connection.
 */
export function validateSignalPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'Invalid signal payload';
  const p = payload as Record<string, unknown>;
  if (p.kind !== 'offer' && p.kind !== 'answer' && p.kind !== 'ice') return 'Unknown signal kind';
  if (p.kind === 'offer' || p.kind === 'answer') {
    if (typeof p.sdp !== 'string' || p.sdp.length < 10 || p.sdp.length > 200000) return 'Invalid SDP';
  }
  if (p.kind === 'ice') {
    if (typeof p.candidate !== 'string' || p.candidate.length > 8000) return 'Invalid ICE candidate';
  }
  return null;
}

/**
 * Speaking detector: RMS (0..1) above threshold counts as voice activity.
 * The engine keeps the hangover itself; this pure check is what unit tests
 * exercise.
 */
export const SPEAKING_RMS_THRESHOLD = 0.02;

export function isVoiceActive(rms: number, threshold: number = SPEAKING_RMS_THRESHOLD): boolean {
  if (!Number.isFinite(rms) || rms < 0) return false;
  return rms >= threshold;
}

/** localStorage key for persisted device/voice preferences. */
export const VOICE_PREFS_KEY = 'cp-voice-prefs';

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  micVolume: 1,
  speakerVolume: 1,
};

export function loadDevicePrefs(storage?: Pick<Storage, 'getItem'>): DevicePrefs {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  try {
    const raw = store?.getItem(VOICE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_DEVICE_PREFS };
    const parsed = JSON.parse(raw) as Partial<DevicePrefs>;
    return {
      ...DEFAULT_DEVICE_PREFS,
      ...parsed,
      noiseSuppression: parsed.noiseSuppression !== false,
      echoCancellation: parsed.echoCancellation !== false,
      autoGainControl: parsed.autoGainControl !== false,
      micVolume: clamp01(parsed.micVolume, 1),
      speakerVolume: clamp01(parsed.speakerVolume, 1),
    };
  } catch {
    return { ...DEFAULT_DEVICE_PREFS };
  }
}

export function saveDevicePrefs(prefs: DevicePrefs, storage?: Pick<Storage, 'setItem'>): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  try {
    store?.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full or unavailable — prefs just won't persist */
  }
}

function clamp01(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Merge a fresh `voice:presence` (or REST join) participant list into the
 * current list. Preserves local-only state (speaking, streams, quality) by
 * matching on memberId. The self entry is kept in the list with isSelf=true.
 */
export function mergePresenceParticipants(
  prev: VoiceParticipant[],
  incoming: RawPresenceParticipant[],
  selfMemberId: number,
  selfName: string,
  selfAvatarUrl: string | null,
): VoiceParticipant[] {
  const prevById = new Map(prev.map((p) => [p.memberId, p]));
  const next: VoiceParticipant[] = [];
  const seen = new Set<number>();

  for (const raw of incoming) {
    if (seen.has(raw.member_id)) continue;
    seen.add(raw.member_id);
    const old = prevById.get(raw.member_id);
    const isSelf = raw.member_id === selfMemberId;
    next.push({
      memberId: raw.member_id,
      name: isSelf ? selfName || raw.name : raw.name,
      avatarUrl: isSelf ? selfAvatarUrl ?? raw.avatar_url : raw.avatar_url,
      isMuted: raw.is_muted,
      isDeafened: raw.is_deafened,
      cameraOn: raw.camera_on,
      sharingScreen: raw.sharing_screen,
      speaking: old?.speaking ?? false,
      connectionQuality: old?.connectionQuality ?? 'unknown',
      stream: old?.stream,
      screenStream: old?.screenStream,
      isSelf,
      joinedAt: raw.joined_at ?? old?.joinedAt,
    });
  }

  // If the server presence omits self (join race), keep the old self entry.
  if (!seen.has(selfMemberId)) {
    const oldSelf = prevById.get(selfMemberId);
    if (oldSelf) next.push(oldSelf);
  }
  return next;
}
