# Voice & Video Calling

Discord-style voice/video calling for Control Point: persistent voice channels,
DM/group calls with ringing invites, and full moderation. Media is **peer-to-peer
WebRTC (full mesh)** — no media server. Signaling rides the app's existing WebSocket.

> **Privacy invariant:** no audio/video is ever recorded or stored. SDP offers/answers
> and ICE candidates are relayed **in memory** between the two participants and are
> **never persisted or logged**.

## 1. Architecture

```
 ┌─────────────┐   voice:signal (offer/answer/ice)   ┌─────────────┐
 │  Client A   │ ───── in-memory relay, no DB ────── │  Client B   │
 │ (webrtc.ts) │ ◄── voice:presence / voice:state ── │ (webrtc.ts) │
 └──────┬──────┘         REST for session mgmt        └──────┬──────┘
        │                                                     │
        └──────── media: P2P WebRTC, full mesh ─────────────┘
                      (direct browser ↔ browser RTP)
```

### Signaling rides the existing WebSocket

There is **one** app WebSocket (see `App.tsx connectSocket`). Voice signaling is a
set of message types handled by `handleVoiceWSMessage()` in `server/voice.ts` —
it is called from the main `wss` message handler in `server.ts`.

| WS message | Direction | Purpose |
|---|---|---|
| `voice:signal` | client ⇄ server ⇄ client | SDP offer/answer and ICE candidate relay. Server verifies both sides are **active participants of the same session** (derived from the sender, never trusted from the client) and relays in memory. Malformed payloads get a `voice:error` reply. |
| `voice:presence` | server → team | Authoritative participant list for a session: who is in, mute/deafen/camera/screen flags, connection state, spotlight. Broadcast on every join/leave/moderation. |
| `voice:state` | client → server → team | Self-state patch (mute/deafen/camera/screen/connection_state). Server persists the flags on `call_participants` and rebroadcasts. |
| `voice:moderated` | server → team | A moderator action was applied (mute/deafen/remove/move/lock/...). Clients enforce self-targeted actions locally (e.g. actually disable the mic). |
| `voice:kicked` | server → member | Your client must tear down (reasons: `removed`, `call_ended`, `channel_deleted`, `disconnect`, `ended`). |
| `voice:session-ended` | server → team | Session fully ended (empty / ended by moderator / channel deleted). |
| `voice:incoming` | server → member | Ringing DM/group invite (`invite_id`, `session_id`, kind, media, inviter). Client shows accept/decline. |
| `voice:ring-cancelled` | server → member | Caller hung up before you answered — clear the ringing UI. |
| `voice:invite-accepted` / `voice:invite-declined` | server → member | Caller-side notices. |
| `voice:spotlight` | server → team | Global spotlight set/cleared by a moderator. |
| `voice:moved` | server → member | You were moved to another voice channel's session — rejoin there. |
| `voice:error` | server → member | Signal validation failure. |

### Presence source of truth

`call_participants` with `left_at IS NULL` = "currently in this call". In-memory
socket tracking (`memberSocketCount`) is layered on top only for fast disconnect
cleanup. Session rows are ephemeral for voice channels: created on first join,
ended when the last participant leaves (also enforced by a 60-second maintenance
sweep in `server.ts` that ends zombie sessions and expires stale invites).

### Reconnect grace

When a member's **last** socket closes (tab crash, network blip), the server does
*not* drop them from the call immediately. `scheduleVoiceDisconnectCleanup()` sets
a timer for the grace window (default 45 s). Reconnecting (`hello`), rejoining
via REST, or accepting an invite inside the window cancels it — the participant
row survives and the call carries on. Timer is `unref`'d so it never holds the
process alive.

### The SFU seam: `VoiceSignaling`

`src/voice/webrtc.ts` defines a minimal interface that all signaling goes through:

```ts
export interface VoiceSignaling {
  sendSignal(toMemberId: number, payload: SignalPayload): void;
  onSignal(cb: (fromMemberId: number, sessionId: number, payload: SignalPayload) => void): () => void;
}
```

Today's implementation (`VoiceContext`) sends `voice:signal` over the app
WebSocket. The call UI only consumes `VoiceEngineEvents` callbacks (`onRemoteStreams`,
`onSpeaking`, `onMicLevel`, `onConnectionQuality`, `onPeerFailed`, `onPeerLeft`),
so swapping to an SFU means reimplementing `VoiceSignaling` + `VoiceEngine`'s peer
management — **no UI changes**. See §4 for the SFU path.

### REST API (`registerVoiceRoutes`)

| Route | Perm | Purpose |
|---|---|---|
| `GET /api/voice/channels` | auth | List voice channels (only ones the member can view) with live session/participant info. |
| `POST /api/voice/channels` | `manage_voice` | Create channel (name, description, category, max participants, private, video/screenshare flags). |
| `PATCH /api/voice/channels/:id` | `manage_voice` | Update channel fields. |
| `DELETE /api/voice/channels/:id` | `manage_voice` | Delete; ends any active session with clean teardown. |
| `POST /api/voice/channels/reorder` | `manage_voice` | Reorder channels. |
| `GET/PUT /api/voice/channels/:id/role-perms` | `manage_voice` | Per-role overrides (view/join/speak/video/screenshare). |
| `POST /api/voice/channels/:id/join` | auth + channel ACL | Join (creates the session if needed). Returns `{ session, ice }`. 403 if locked/full/no-permission; **409 if already in another call**. |
| `POST /api/voice/leave` | auth | Leave current call (idempotent). |
| `POST /api/voice/moderate` | `moderate_calls` or `manage_voice` | mute/deafen/remove/move/stop_screen/disable_video/lock/unlock/end/spotlight/unspotlight. |
| `POST /api/voice/calls` | auth | Start DM (`invitee_ids` length 1) or group call; sends `voice:incoming` to each invitee. |
| `POST /api/voice/calls/:id/accept` | auth | Accept a ringing invite. Returns ICE servers. |
| `POST /api/voice/calls/:id/decline` | auth | Decline. |
| `POST /api/voice/calls/:id/end` | auth (participant or moderator) | End; for DM/group calls this ends it for everyone. |
| `GET /api/voice/settings` | auth | Team voice settings. |
| `PUT /api/voice/settings` | `manage_voice` | Update settings. |
| `GET /api/voice/ice` | auth | **ICE server list** — use this to verify STUN/TURN config (§3). |

DM/group calls are scoped to the team: every invitee must be an active member of
the inviter's team. Default seed channels (created once per team): "Team Meeting",
"Strategy", "Drive Practice", "Build Room".

## 2. Environment variables

| Name | Purpose | Default |
|---|---|---|
| `STUN_URLS` | Comma-separated STUN server URLs for NAT discovery | `stun:stun.l.google.com:19302` |
| `TURN_URLS` | Comma-separated TURN server URLs (relay fallback) | *(none — TURN disabled)* |
| `TURN_USERNAME` | TURN credential username | *(none)* |
| `TURN_CREDENTIAL` | TURN credential password | *(none)* |
| `CALL_INVITE_TTL_SECONDS` | How long a ringing invite stays valid before expiring | `60` (clamped to max 300) |
| `VOICE_RECONNECT_GRACE_SECONDS` | Grace window after last socket closes before a member is dropped from calls | `45` (clamped to 5–300) |

The values are parsed by `iceServersFromEnv()`, `inviteTtlSeconds()`, and
`reconnectGraceSeconds()` in `server/voice.ts`.

> **TURN is optional — but read this:** without TURN, calls are **STUN-only**.
> That works for most home/office networks but **will fail for users behind
> symmetric NATs** (common on cellular hotspots, some campuses, corporate
> firewalls). If people report "call connects but no audio/video" on certain
> networks, missing TURN is the first suspect.

## 3. STUN/TURN configuration

- **STUN** lets two browsers discover their public addresses so they can connect
  directly. The Google default is fine for most teams.
- **TURN** relays media through a server when a direct path is impossible
  (symmetric NAT / restrictive firewall). It costs bandwidth on your TURN host
  but is the only way those users get calls at all.

Set them in the **Render dashboard** (service → Environment), **never in chat,
never in the repo**:

```
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:turn.example.com:3478
TURN_USERNAME=controlpoint
TURN_CREDENTIAL=<a strong generated password>
```

Free/low-cost TURN options: [Cloudflare Calls TURN](https://developers.cloudflare.com/calls/turn/),
[coturn](https://github.com/coturn/coturn) self-hosted on a cheap VPS, or
[Metered.ca](https://www.metered.ca/stun-turn/) (free tier). **Rotate the
TURN credential periodically** and never paste real credentials into chat —
use the Render dashboard directly (see the secret-handling workflow in
`MEMORY.md`).

**Verify the config live:**

```bash
curl -H "X-Session-ID: <your-session-id>" https://<your-app>.onrender.com/api/voice/ice
```

Expected (STUN-only):

```json
{ "iceServers": [{ "urls": ["stun:stun.l.google.com:19302"] }] }
```

With TURN configured, a second entry appears with `urls`, `username`, and
`credential`. The same object is returned by the join/accept endpoints, and the
client hands it straight to `new RTCPeerConnection({ iceServers })`.

**Client-side check:** join a call from two tabs, open `chrome://webrtc-internals`
(or `about:webrtc` in Firefox) and look at the candidate pairs — a `relay`
candidate type means TURN is working.

## 4. SFU path

Full mesh opens one `RTCPeerConnection` **per participant pair**. Each client
encodes and uploads its camera once per peer, and decodes one stream per peer —
cost scales roughly **quadratically**. Practical guidance:

- **Fine:** audio-only with 8–12 people; video with 2–4 people.
- **Degrades past ~6–8 video participants:** CPU (encode × N), upstream
  bandwidth, and grid layout all fall over. Clients set a per-channel
  `max_participants` cap and a team `default_max_participants` — use them.
- **Needs an SFU:** regularly hosting 10+ video participants, or calls over
  constrained uplinks.

Options: **LiveKit** (easiest self-host/Cloud option, good SDKs),
**mediasoup** (maximum control, more ops work), **Janus** (plugin-based,
mature). Any of them slots into the seam described in §1:

1. Reimplement the `VoiceSignaling` interface (send/receive) against the SFU's
   signaling (e.g. LiveKit room events).
2. Replace `VoiceEngine`'s per-peer `RTCPeerConnection` management with one
   connection to the SFU + per-participant remote tracks. Keep the
   `VoiceEngineEvents` callback surface identical so the call UI doesn't change.
3. Keep the server as the source of truth for presence, ACLs, moderation, and
   invites — the SFU only carries media. Presence (`voice:presence`) and the
   moderation log stay in the app DB, not the SFU.

Not needed until teams consistently outgrow the mesh; don't build it preemptively.

## 5. HTTPS & browser permissions

`getUserMedia` / `getDisplayMedia` require a **secure context** — production on
Render (`https://…`) qualifies; `http://localhost` also counts as secure for local
testing. Plain `http://<lan-ip>` from another machine will fail with
`not-supported`.

Permission rules (enforced in `src/voice/media.ts`, mirrored by UX):

- **Mic/camera/screen are never acquired except from an explicit user action**:
  joining with audio/video, toggling the camera on, or starting a screen share.
  `enumerateDevices()` alone never prompts (device labels stay empty until
  permission is granted once — that's a browser rule, not a bug).
- Errors map to friendly codes: `denied` (permission blocked — user must allow
  in the browser site settings), `not-found` (no mic/camera), `not-supported`
  (no `getUserMedia` — insecure context or old browser), `in-use` (device held
  by another app), `unknown`.
- `VoiceContext` exposes `micDenied` so the UI shows a warning rather than a
  silent failure; camera failure degrades to **audio-only join** instead of
  failing the join.
- Cancelling the screen-share picker is treated as "not an error" (no toast).

## 6. Database

Migration: `migrations/versions/002-voice-calls.sql` (no `003` voice migration
exists — verify before assuming newer schema).

| Table | Stores |
|---|---|
| `voice_channels` | Team voice channels: name, description, category, position, `max_participants` (0 = unlimited), `is_private`, `locked`, `allow_video`, `allow_screenshare`. |
| `voice_channel_role_perms` | Per-role overrides per channel (`can_view/join/speak/video/screenshare`), unique on (channel, role). |
| `call_sessions` | One row per call: `kind` (`voice_channel` / `dm` / `group`), `channel_id`, name, `started_at`, `ended_at` (NULL = active), `locked`, `global_spotlight_member_id`, `max_participants`. |
| `call_participants` | Join/leave **history** — `left_at IS NULL` means "currently in the call". Also carries the live flags: `is_muted`, `is_deafened`, `camera_on`, `sharing_screen`, `connection_state`. |
| `call_invites` | Ringing DM/group invites: inviter, invitee, `media` (audio/video), `status` (ringing/accepted/declined/expired/cancelled). |
| `call_moderation_log` | Audit trail: session, team, actor, target, action, detail, timestamp. |
| `team_voice_settings` | Per-team flags: video/screenshare/global-spotlight/DM/group enabled, `default_max_participants`, `default_video_quality` (low/medium/high), `call_timeout_minutes` (0 = none), `reconnect_attempts`. |

**Privacy invariant (enforced by design, not policy):** no table stores media,
SDP, or ICE candidates. The moderation log records *actions* (who muted whom,
when) — never content. Voice-channel sessions are ephemeral rows; DM/group
invites expire.

## 7. Permissions model

Two permissions (registered in `server.ts`'s permission list):

- **`manage_voice`** — create/edit/delete/reorder voice channels, manage role
  overrides, change team voice settings. **Bypasses channel ACLs** (can view and
  join private channels, joins full/locked channels).
- **`moderate_calls`** — mute/deafen/remove/move/stop-screen/disable-video/
  lock/unlock/end/spotlight on other participants. (`manage_voice` holders can
  also moderate; both require `requireAuth` + explicit perm check server-side.)

Per-channel role overrides (`voice_channel_role_perms`): view / join / speak /
video / screenshare, resolved in `resolveChannelAccess()`. Resolution rules:

- No override rows at all → everyone can do everything (subject to channel's
  `allow_video` / `allow_screenshare` and team settings).
- With rows: a member needs an explicit grant from one of their roles. Private
  channels additionally require `can_view` to even appear in the list.
- `manage_voice` / `*` bypasses ACLs but still respects the channel's
  `allow_video` / `allow_screenshare` flags and the team settings.

Other server-side rules: the `locked` flag (set via moderation `lock` or channel
PATCH) blocks new joins except for privileged members; `max_participants` caps
joins; moderation actions **cannot target yourself**; signal relay only happens
between two verified participants of the same session; invitee IDs are
re-validated as active team members on every call creation.

## 8. Client engine (`src/voice/`)

| Module | Responsibility |
|---|---|
| `types.ts` | UI-agnostic types + pure, unit-tested helpers (`shouldCreateOffer`, `validateSignalPayload`, `isVoiceActive`, `mergePresenceParticipants`, `loadDevicePrefs`/`saveDevicePrefs`). |
| `webrtc.ts` | `VoiceEngine`: full-mesh peer management behind the `VoiceSignaling` interface. |
| `media.ts` | Device enumeration, `getMicStream` / `getCameraStream` / `getScreenStream` (user-gesture-only), `MediaError` codes, hot-plug `devicechange`. |
| `api.ts` | Thin REST wrappers (`voiceApi`); maps snake_case → camelCase. |
| `VoiceContext.tsx` | `VoiceProvider` + `useVoice()` — all call state; never opens its own socket (wired to the app socket via `attachSocket` / `handleSocketMessage`). |
| `index.ts` | Public API barrel — call UI imports from here. |
| `__tests__/` | Unit tests for the pure helpers and engine logic. |

**`VoiceContext` API summary** — state: `status` (idle/joining/connected/reconnecting/failed/ended),
`session`, `participants`, `self` (mute/deafen/camera/screen/micLevel),
`channels`, `incomingCall`, `localStream`/`localScreenStream`, `devices`,
`selectedDevices`, `micDenied`, `error`. Actions: `joinChannel(channelId, {video})`,
`startCall(inviteeIds, media)`, `acceptCall`, `declineCall`, `endCall`, `leave`,
`toggleMute`/`toggleDeafen`/`toggleCamera`/`toggleScreenShare`, `setDevice`,
`moderate`, `refreshChannels`, personal `pin`/`spotlight` (local-only, never sent
to the server), `expanded` (call view size).

Engine behaviors worth knowing:

- **Glare avoidance:** when a new participant appears, the peer with the **higher
  member id** creates the offer; the lower id is the "polite" peer and waits.
  Deterministic and symmetric — no election round-trip. Collisions resolve via
  perfect-negotiation rollback.
- **ICE restart:** on `failed`/`disconnected`, the engine retries with
  exponential backoff (1.5 s × 2ⁿ), up to **3 attempts**; then fires
  `onPeerFailed` so the UI can show "connection trouble". Reconnect also
  re-triggers negotiation through the offerer.
- **Speaking detection:** WebAudio analyser on each remote audio track + the
  local mic; RMS ≥ 0.02 counts as voice with a 500 ms hangover to avoid flicker.
  Speaking flags are computed **locally and never sent to the server**.
- **Deafen is local-only:** remote audio tracks are disabled in this client;
  remotes keep sending (Discord semantics).
- **Screen-share track convention:** the sender always adds camera before
  screen; the receiver treats the **first** remote video track as camera and the
  **second** as screen share.
- **Device prefs** (`cp-voice-prefs` in localStorage): mic/camera/speaker
  device IDs, noise suppression / echo cancellation / auto-gain (all default
  on), mic + speaker volume. Device switches apply live mid-call without
  renegotiation.

## 9. UI components (`src/components/voice/`)

All components consume the engine via `useVoice()` from `src/voice/` only.
Mount points in `src/App.tsx` are noted per component.

| Component | Purpose | Mounted |
|---|---|---|
| `VoiceChannelList.tsx` | `VOICE CHANNELS` sidebar section: channel rows (lock/private badges, live participant counts), expandable participant rows, click-to-join. Mirrors the text-channel row styling. | `ChatView` channel list, below the text channels (`App.tsx` `channelList`). |
| `UserVoiceControls.tsx` | Discord-style bottom-left controls: mic toggle + input-device dropdown + level meter, deafen toggle + output dropdown, settings gear. No-op with a hint when idle. | Sidebar footer, above the user/presence card (`App.tsx`). Owns a `DeviceSettingsModal` instance. |
| `CallBar.tsx` | Compact persistent call bar (session name, status pill, participant count, mute/deafen/camera/screen/expand/leave). Fixed bottom, above the mobile nav; hidden when idle. Lives outside the routed views so it survives navigation. | App root (`App.tsx`), next to `BrunoPanel`. Owns a `DeviceSettingsModal` instance. |
| `IncomingCallModal.tsx` | Ringing invite: accept / decline / dismiss (dismiss hides without notifying the caller); warns and requires an explicit "Leave & join" choice when already in a call. | App root (`App.tsx`); driven by `incomingCall`. |
| `CallView.tsx` | Expanded full-screen call view: adaptive participant grid, spotlight/pin, per-participant menus. | App root (`App.tsx`); driven by `expanded` + `session`. |
| `DeviceSettingsModal.tsx` | Mic/camera/speaker pickers, permission states, audio-processing toggles (persisted to `cp-voice-prefs`). | Owned internally by `UserVoiceControls` / `CallBar` (needs their open state); no separate app-root mount. |
| `ParticipantMenu.tsx` | Per-participant context menu: pin/spotlight (local-only), volume, moderator actions (mute/deafen/disable-video/stop-screen/remove/move) gated on `canModerate`. | Used by `CallView` tiles. |
| `VoiceChannelAdmin.tsx` | Admin channel management: create/rename/reorder/delete, lock/unlock, end call, private-channel role permission matrix. | Settings → "Voice & Calls" card (`App.tsx` `SettingsView`), gated on `hasPerm('manage_voice')`. |
| `VoiceSettingsSection.tsx` | Team voice defaults: audio quality, max participants, invite TTL, reconnect grace, ringing, etc. (every `team_voice_settings` field; no fake controls). | Settings → "Voice & Calls" card, same gate. |
| `CallHeaderButtons.tsx` | Audio/video call buttons for DM/group conversation headers (`startCall`). | **Not mounted** — the app has channel-based chat only, no DM/group message headers; ready for when that UI lands. |
| `shared.tsx` | Shared primitives: `VoiceAvatar`, `CallStatusPill`, `QualityBadge`, `MicLevelMeter`, `VoiceIconButton`, `StreamVideo`, `ParticipantAudio`, per-peer volume persistence. | — |
| `index.ts` | Component barrel. | — |

Wiring summary: `<VoiceProvider>` wraps the authenticated app in `App.tsx`;
`VoiceSocketBridge` (inside the provider) exposes the engine's socket API to
App through a ref — `ws.onmessage` routes `voice:*` to `handleSocketMessage`
first, `ws.onopen` calls `attachSocket` after the hello, `ws.onclose` calls
`detachSocket` before the 3 s reconnect. Team switch and logout call `leave()`
first so no ghost participants remain. The app keeps exactly one WebSocket.

## 10. Local testing

1. **Scratch DB:** run the server against a throwaway SQLite file (not the
   shared dev DB) so voice rows don't pollute anything. Migrations run on boot.
2. **Two users:** open two browser tabs (or a normal + an incognito window) and
   sign in as two different members of the same team. The app's single
   WebSocket identifies each side independently.
3. **Channels:** as an admin (`manage_voice`), create a voice channel, set a
   per-channel cap, toggle `is_private` + a role override, and try joining from
   the non-admin tab to see the ACLs bite.
4. **Call flow:** join from both tabs → both tiles appear via `voice:presence`.
   Toggle mute/deafen/camera/screen-share on each side; confirm the remote tile
   updates (flags travel over `voice:state`).
5. **Reconnect grace:** in DevTools → Network, set one tab **offline** for ~20 s
   then back online. The participant should stay in the call (grace default
   45 s). Leave it offline > 45 s and the cleanup should drop them with a
   presence update. `VOICE_RECONNECT_GRACE_SECONDS=10` in your local env makes
   this fast to test.
6. **Moderation:** from the admin tab, run mute / disable-video / remove / lock
   against the other tab; confirm the target's client enforces it locally and
   the audit row lands in `call_moderation_log`.
7. **DM/group:** start a DM call from one tab; the other gets the ringing
   `voice:incoming` UI. Test accept, decline, and caller hang-up
   (`voice:ring-cancelled`). Invite expiry: set `CALL_INVITE_TTL_SECONDS=10`.
8. **ICE check:** `GET /api/voice/ice` with your session header should show the
   STUN entry (and TURN entries if configured). In `chrome://webrtc-internals`,
   look for `relay` candidate pairs to prove TURN works.

## 11. Production deployment

- **Deploys on push to `main`** — Render auto-builds and restarts. No separate
  deploy step.
- **Env vars go in the Render dashboard** (service → Environment), including
  `STUN_URLS` / `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL`,
  `CALL_INVITE_TTL_SECONDS`, `VOICE_RECONNECT_GRACE_SECONDS`. Never commit them.
- **No media server is needed** for P2P: the signaling is the existing Node
  WebSocket, and media flows browser-to-browser. Cost is roughly zero beyond
  the existing Render instance — *unless* you add a TURN server, which carries
  the relayed bandwidth.
- **Practical full-mesh limit:** plan for small team calls; expect degradation
  past ~6–8 video participants (§4). Enforce `default_max_participants` in
  team settings if abuse is a concern.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Mic/camera permission denied | Browser blocked the site, or the OS-level toggle is off | `denied` → user must allow in the browser's site settings (lock icon in the address bar) and rejoin; `micDenied` state in the UI flags this |
| No devices found | No mic/camera plugged in, or another app holds the device (`in-use`) | Check `enumerateDevices()` output in the device settings; close Zoom/Teams/OBS; hot-plug re-runs enumeration via `devicechange` |
| Call connects but no audio/video on some networks; `chrome://webrtc-internals` shows no `relay` candidates | STUN-only deployment; symmetric NAT / strict firewall blocks direct paths | Configure TURN (§3) and verify with `GET /api/voice/ice`; retest — relay candidates should appear |
| Signaling WS down / calls don't start | App WebSocket not connected (signaling rides it) | Check the app socket reconnects; server logs for `voice:error`; join/leave REST still work but no SDP relay without the socket |
| `409 "You're already in another call"` | Stale participant row (crashed tab) or a real second call | Leave the other call; if phantom, the 60-second maintenance sweep ends zombie sessions, or wait out the reconnect grace and rejoin |
| Kicked / removed unexpectedly | Moderator action, channel deleted, or network drop past the grace window | Check `call_moderation_log` (admins) for who did what; rejoin |
| Echo | Speakers feeding back into the mic | Wear headphones; confirm echo cancellation is on in device settings (`cp-voice-prefs`); lower speaker volume |
| High CPU / fans on large grids | Full mesh: encode × N peers, decode × N peers | Drop to audio-only, lower `default_video_quality` (low = 640×360@15fps), or set a `max_participants` cap on the channel |
| Screen share shows as a second camera tile | Track-order convention broken by a third-party client | The sender must add the camera track before the screen track (§8); verify the sender is the app's engine |
| "Connection trouble with a participant" | ICE restarts exhausted (3 attempts) | Usually transient — the engine keeps the peer and retries on the next state change; persistent failures point back at missing TURN |

---

*Sources: `server/voice.ts` (routes, signaling, env parsing), `migrations/versions/002-voice-calls.sql`,
`src/voice/` (`types.ts`, `webrtc.ts`, `media.ts`, `api.ts`, `VoiceContext.tsx`, `index.ts`),
`server.ts` (route registration, socket wiring, maintenance sweep). UI in `src/components/voice/`
was not yet present — §9 marked accordingly.*
