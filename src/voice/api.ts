// Thin REST wrappers for the voice calling API (server/voice.ts).
// All calls go through apiJson so the X-Session-ID header and the standard
// error handling apply. Raw snake_case responses are mapped to the
// camelCase types in ./types.

import { apiJson } from '../services/api';
import type {
  IncomingCall,
  RawPresenceParticipant,
  VoiceChannelSummary,
  VoiceSessionInfo,
} from './types';

export type ModerationAction =
  | 'mute'
  | 'deafen'
  | 'remove'
  | 'move'
  | 'stop_screen'
  | 'disable_video'
  | 'lock'
  | 'unlock'
  | 'end'
  | 'spotlight'
  | 'unspotlight';

export interface JoinResult {
  session: VoiceSessionInfo & { participants: RawPresenceParticipant[] };
  ice: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

export interface StartCallResult {
  sessionId: number;
  /** Public temp channel backing the call — anyone on the team can join it. */
  channelId: number;
  channelName: string;
  invites: Array<{ id: number; invitee_id: number }>;
  ice: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

function mapSession(raw: any): VoiceSessionInfo {
  return {
    id: Number(raw.id),
    kind: raw.kind === 'dm' || raw.kind === 'group' ? raw.kind : 'voice_channel',
    channelId: raw.channel_id != null ? Number(raw.channel_id) : null,
    name: String(raw.name ?? 'Call'),
    locked: raw.locked === 1 || raw.locked === true,
    globalSpotlightMemberId:
      raw.global_spotlight_member_id != null ? Number(raw.global_spotlight_member_id) : null,
  };
}

function mapChannel(raw: any): VoiceChannelSummary {
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    maxParticipants: Number(raw.max_participants ?? 0),
    locked: raw.locked === 1 || raw.locked === true,
    isPrivate: raw.is_private === 1 || raw.is_private === true,
    isTemporary: raw.is_temporary === 1 || raw.is_temporary === true,
    sessionId: raw.session_id != null ? Number(raw.session_id) : null,
    participantCount: Number(raw.participant_count ?? 0),
    participants: Array.isArray(raw.participants) ? raw.participants : [],
  };
}

export const voiceApi = {
  /** List this team's voice channels with live session/participant info. */
  getChannels(): Promise<VoiceChannelSummary[]> {
    return apiJson<{ channels: any[] }>('/api/voice/channels').then((r) =>
      (r.channels ?? []).map(mapChannel),
    );
  },

  /** Join a voice channel. Server broadcasts voice:presence to the team. */
  joinChannel(channelId: number): Promise<JoinResult> {
    return apiJson<{ session: any; ice: any[] }>(`/api/voice/channels/${channelId}/join`, {
      method: 'POST',
    }).then((r) => ({
      session: { ...mapSession(r.session), participants: r.session?.participants ?? [] },
      ice: r.ice ?? [],
    }));
  },

  /** Leave the current call (idempotent server-side). */
  leave(): Promise<void> {
    return apiJson<{ ok: boolean }>('/api/voice/leave', { method: 'POST' }).then(() => {});
  },

  /** Moderator action against another participant / the session. */
  moderate(
    action: ModerationAction,
    sessionId: number,
    targetMemberId: number,
    extra?: { targetChannelId?: number; reason?: string },
  ): Promise<void> {
    return apiJson<{ ok: boolean }>('/api/voice/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        session_id: sessionId,
        target_member_id: targetMemberId,
        ...(extra?.targetChannelId != null ? { target_channel_id: extra.targetChannelId } : {}),
        ...(extra?.reason ? { reason: extra.reason } : {}),
      }),
    }).then(() => {});
  },

  /** Start an ad-hoc call: creates a public temp voice channel and rings the invitees. */
  startCall(inviteeIds: number[], media: 'audio' | 'video', kind: 'dm' | 'group'): Promise<StartCallResult> {
    return apiJson<{ session_id: number; channel_id: number; channel_name: string; invites: any[]; ice: any[] }>('/api/voice/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, media, invitee_ids: inviteeIds }),
    }).then((r) => ({
      sessionId: Number(r.session_id),
      channelId: Number(r.channel_id),
      channelName: String(r.channel_name ?? 'Call'),
      invites: r.invites ?? [],
      ice: r.ice ?? [],
    }));
  },

  /** Accept a ringing invite (the invite_id lives in `voice:incoming`; the URL takes the session id). */
  acceptCall(sessionId: number): Promise<{
    ice: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    session: { id: number; kind: string; channel_id: number | null; name: string };
  }> {
    return apiJson<{ ok: boolean; ice: any[]; session: any }>(`/api/voice/calls/${sessionId}/accept`, {
      method: 'POST',
    }).then((r) => ({
      ice: r.ice ?? [],
      session: {
        id: Number(r.session?.id ?? sessionId),
        kind: String(r.session?.kind ?? 'voice_channel'),
        channel_id: r.session?.channel_id != null ? Number(r.session.channel_id) : null,
        name: String(r.session?.name ?? 'Call'),
      },
    }));
  },

  declineCall(sessionId: number): Promise<void> {
    return apiJson<{ ok: boolean }>(`/api/voice/calls/${sessionId}/decline`, {
      method: 'POST',
    }).then(() => {});
  },

  endCall(sessionId: number): Promise<void> {
    return apiJson<{ ok: boolean }>(`/api/voice/calls/${sessionId}/end`, {
      method: 'POST',
    }).then(() => {});
  },

  getIceServers(): Promise<Array<{ urls: string | string[]; username?: string; credential?: string }>> {
    return apiJson<{ iceServers: any[] }>('/api/voice/ice').then((r) => r.iceServers ?? []);
  },

  getSettings(): Promise<any> {
    return apiJson<{ settings: any }>('/api/voice/settings').then((r) => r.settings);
  },

  /** Update team voice settings (requires manage_voice; server-validated). */
  putSettings(body: Record<string, any>): Promise<any> {
    return apiJson<{ settings: any }>('/api/voice/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.settings);
  },
};

/** Channel admin REST (all require manage_voice server-side). */
export interface VoiceChannelAdminPayload {
  name?: string;
  description?: string;
  category_id?: number | null;
  max_participants?: number;
  is_private?: boolean;
  locked?: boolean;
  allow_video?: boolean;
  allow_screenshare?: boolean;
}

export interface RolePermRow {
  role_id: number;
  can_view: boolean;
  can_join: boolean;
  can_speak: boolean;
  can_video: boolean;
  can_screenshare: boolean;
}

export const voiceAdminApi = {
  createChannel(body: VoiceChannelAdminPayload): Promise<any> {
    return apiJson<{ channel: any }>('/api/voice/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.channel);
  },
  patchChannel(channelId: number, body: VoiceChannelAdminPayload): Promise<any> {
    return apiJson<{ channel: any }>(`/api/voice/channels/${channelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.channel);
  },
  deleteChannel(channelId: number): Promise<void> {
    return apiJson<{ ok: boolean }>(`/api/voice/channels/${channelId}`, {
      method: 'DELETE',
    }).then(() => {});
  },
  reorderChannels(order: number[]): Promise<void> {
    return apiJson<{ channels: any[] }>('/api/voice/channels/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }).then(() => {});
  },
  getRolePerms(channelId: number): Promise<any[]> {
    return apiJson<{ perms: any[] }>(`/api/voice/channels/${channelId}/role-perms`).then(
      (r) => r.perms ?? [],
    );
  },
  putRolePerms(channelId: number, perms: RolePermRow[]): Promise<any[]> {
    return apiJson<{ perms: any[] }>(`/api/voice/channels/${channelId}/role-perms`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ perms }),
    }).then((r) => r.perms ?? []);
  },
};

export type { IncomingCall };
