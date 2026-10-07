// VoiceProvider + useVoice(): React state management for voice/video calls.
//
// This module owns all call state. It does NOT render anything (the Discord-
// inspired UI comes later) and it does NOT open its own websocket — the app
// has exactly one socket (see App.tsx connectSocket). The host wires it up:
//
//   const voice = useRef<VoiceSocketApi>(null);
//   <VoiceProvider ref-api ...>
//   ws.onmessage = (e) => { if (voiceApiRef.current?.handleSocketMessage(msg)) return; ... }
//
// Personal pin/spotlight are LOCAL-ONLY and are never sent to the server.
// The global spotlight (session.globalSpotlightMemberId) is server-driven;
// moderators change it via moderate('spotlight' | 'unspotlight', ...).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_DEVICE_PREFS,
  loadDevicePrefs,
  mergePresenceParticipants,
  saveDevicePrefs,
  type ConnectionQuality,
  type DevicePrefs,
  type IncomingCall,
  type SignalPayload,
  type VoiceChannelSummary,
  type VoiceParticipant,
  type VoiceSessionInfo,
} from './types';
import { voiceApi, type ModerationAction } from './api';
import {
  enumerateDevices,
  getCameraStream,
  getMicStream,
  getScreenStream,
  MediaError,
  onDeviceChange,
  stopStream,
  type DeviceLists,
} from './media';
import { VoiceEngine, type VoiceSignaling } from './webrtc';

export interface SelfState {
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  sharingScreen: boolean;
  micLevel: number; // 0..1, for the level meter
}

export interface SelectedDevices {
  micId?: string;
  cameraId?: string;
  speakerId?: string;
}

export type SetDeviceKind = 'mic' | 'camera' | 'speaker';

export interface VoiceStatePatch {
  is_muted?: boolean;
  is_deafened?: boolean;
  camera_on?: boolean;
  sharing_screen?: boolean;
  connection_state?: string;
}

/** The exact context shape the call UI will be built against. */
export interface VoiceContextValue {
  status: 'idle' | 'joining' | 'connected' | 'reconnecting' | 'failed' | 'ended';
  session: VoiceSessionInfo | null;
  participants: VoiceParticipant[];
  self: SelfState;
  channels: VoiceChannelSummary[];
  incomingCall: IncomingCall | null;
  personalPin: number | null;
  personalSpotlight: number | null;
  expanded: boolean;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  devices: DeviceLists;
  selectedDevices: SelectedDevices;
  setDevice: (kind: SetDeviceKind, deviceId: string | undefined) => void;
  /** Current persisted device/voice prefs (cp-voice-prefs). */
  devicePrefs: DevicePrefs;
  /** Merge a patch into the persisted device prefs (used by DeviceSettingsModal). */
  setDevicePrefs: (patch: Partial<DevicePrefs>) => void;
  canModerate: boolean;
  canManageVoice: boolean;
  /** True when the browser reports mic permission as denied — UI shows a warning, not a silent failure. */
  micDenied: boolean;
  error: string | null;
  joinChannel: (channelId: number, opts?: { video?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  startCall: (inviteeIds: number[], media: 'audio' | 'video') => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  /** Hide the incoming-call UI without notifying the caller (the invite stays live). */
  dismissIncomingCall: () => void;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  sendState: (patch: VoiceStatePatch) => void;
  setPersonalPin: (id: number | null) => void;
  setPersonalSpotlight: (id: number | null) => void;
  setExpanded: (b: boolean) => void;
  moderate: (action: ModerationAction, targetMemberId: number, extra?: { targetChannelId?: number; reason?: string }) => Promise<void>;
  refreshChannels: () => Promise<void>;
  clearError: () => void;
  /** Socket wiring (called by App.tsx — the engine never opens its own socket). */
  attachSocket: (send: (msg: any) => void) => void;
  detachSocket: () => void;
  /** Returns true when the message was a voice message and was handled. */
  handleSocketMessage: (msg: any) => boolean;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}

export interface VoiceProviderProps {
  memberId: number | null;
  memberName?: string;
  memberAvatar?: string | null;
  hasPerm?: (perm: string) => boolean;
  children: React.ReactNode;
}

const EMPTY_DEVICES: DeviceLists = { audioinputs: [], videoinputs: [], audiooutputs: [] };

export function VoiceProvider({ memberId, memberName, memberAvatar, hasPerm, children }: VoiceProviderProps) {
  const [status, setStatus] = useState<VoiceContextValue['status']>('idle');
  const [session, setSession] = useState<VoiceSessionInfo | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [self, setSelf] = useState<SelfState>({ muted: false, deafened: false, cameraOn: false, sharingScreen: false, micLevel: 0 });
  const [channels, setChannels] = useState<VoiceChannelSummary[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [personalPin, setPersonalPin] = useState<number | null>(null);
  const [personalSpotlight, setPersonalSpotlight] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceLists>(EMPTY_DEVICES);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => loadDevicePrefs());
  const [micDenied, setMicDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendRef = useRef<((msg: any) => void) | null>(null);
  const engineRef = useRef<VoiceEngine | null>(null);
  const signalCbRef = useRef<((from: number, sessionId: number, payload: SignalPayload) => void) | null>(null);
  const memberIdRef = useRef(memberId);
  const sessionRef = useRef<VoiceSessionInfo | null>(null);
  const selfRef = useRef(self);
  const prefsRef = useRef(prefs);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const memberNameRef = useRef(memberName ?? '');
  const memberAvatarRef = useRef(memberAvatar ?? null);
  /** Current local camera stream, for rebuilding the preview when the mic switches. */
  const cameraStreamRef = useRef<MediaStream | null>(null);

  memberIdRef.current = memberId;
  sessionRef.current = session;
  selfRef.current = self;
  prefsRef.current = prefs;
  incomingCallRef.current = incomingCall;
  memberNameRef.current = memberName ?? '';
  memberAvatarRef.current = memberAvatar ?? null;

  // Live input gain: the engine routes the mic through a GainNode, so the
  // settings slider takes effect mid-call without re-acquiring the mic.
  useEffect(() => {
    engineRef.current?.setMicGain(prefs.micVolume ?? 1);
  }, [prefs.micVolume]);

  const canModerate = useMemo(
    () => Boolean(hasPerm && (hasPerm('moderate_calls') || hasPerm('manage_voice'))),
    [hasPerm],
  );
  const canManageVoice = useMemo(() => Boolean(hasPerm && hasPerm('manage_voice')), [hasPerm]);

  const selectedDevices: SelectedDevices = useMemo(
    () => ({ micId: prefs.micId, cameraId: prefs.cameraId, speakerId: prefs.speakerId }),
    [prefs],
  );

  const clearError = useCallback(() => setError(null), []);

  /** Team's default audio quality (team_voice_settings); wired into the engine's Opus bitrate. */
  const audioQualityRef = useRef<'low' | 'medium' | 'high'>('medium');

  const setDevicePrefs = useCallback((patch: Partial<DevicePrefs>) => {
    setPrefs((prev) => {
      const next: DevicePrefs = { ...prev, ...patch };
      saveDevicePrefs(next);
      return next;
    });
  }, []);

  const sendSocket = useCallback((msg: any) => {
    try {
      sendRef.current?.(msg);
    } catch {
      /* socket not attached yet */
    }
  }, []);

  // ------------------------------------------------------------ engine setup

  const buildLocalPreview = useCallback((mic: MediaStream | null, cam: MediaStream | null) => {
    // One preview stream for the UI tile; analysis/feedback concerns stay in the engine.
    const preview = new MediaStream();
    mic?.getAudioTracks().forEach((t) => preview.addTrack(t));
    cam?.getVideoTracks().forEach((t) => preview.addTrack(t));
    setLocalStream(preview.getTracks().length ? preview : null);
  }, []);

  const applyParticipants = useCallback(
    (raw: Array<{
      member_id: number; name: string; avatar_url: string | null;
      is_muted: boolean; is_deafened: boolean; camera_on: boolean; sharing_screen: boolean;
      joined_at?: string;
    }>) => {
      const selfId = memberIdRef.current;
      if (selfId == null) return;
      setParticipants((prev) =>
        mergePresenceParticipants(prev, raw, selfId, memberNameRef.current, memberAvatarRef.current),
      );
      engineRef.current?.syncPeers(raw.map((p) => p.member_id));
    },
    [],
  );

  /** Spin up the WebRTC engine for an already-created server session. Caller acquired mic/cam. */
  const startEngine = useCallback(
    async (
      info: VoiceSessionInfo,
      iceServers: RTCIceServer[],
      mic: MediaStream,
      cam: MediaStream | null,
      initialParticipants: Array<{
        member_id: number; name: string; avatar_url: string | null;
        is_muted: boolean; is_deafened: boolean; camera_on: boolean; sharing_screen: boolean;
        joined_at?: string;
      }>,
    ) => {
      const selfId = memberIdRef.current;
      if (selfId == null) throw new Error('Not signed in');

      // Tear down any previous engine first — one call at a time.
      engineRef.current?.dispose();
      engineRef.current = null;

      const signaling: VoiceSignaling = {
        sendSignal: (toMemberId, payload) =>
          sendSocket({ type: 'voice:signal', to_member_id: toMemberId, payload }),
        onSignal: (cb) => {
          signalCbRef.current = cb;
          return () => {
            if (signalCbRef.current === cb) signalCbRef.current = null;
          };
        },
      };

      const engine = new VoiceEngine({
        selfMemberId: selfId,
        iceServers,
        signaling,
        audioQuality: audioQualityRef.current,
        events: {
          onRemoteStreams: (peerId, stream, screenStream) => {
            setParticipants((prev) =>
              prev.map((p) =>
                p.memberId === peerId
                  ? { ...p, stream: stream ?? undefined, screenStream: screenStream ?? undefined }
                  : p,
              ),
            );
          },
          onSpeaking: (peerId, speaking) => {
            setParticipants((prev) =>
              prev.map((p) => (p.memberId === peerId ? { ...p, speaking } : p)),
            );
          },
          onMicLevel: (level) => {
            setSelf((prev) => (Math.abs(prev.micLevel - level) > 0.02 ? { ...prev, micLevel: level } : prev));
          },
          onConnectionQuality: (peerId, quality: ConnectionQuality) => {
            setParticipants((prev) =>
              prev.map((p) => (p.memberId === peerId ? { ...p, connectionQuality: quality } : p)),
            );
          },
          onPeerFailed: () => {
            setError('Connection trouble with a participant — still retrying in the background.');
          },
          onPeerLeft: (peerId) => {
            setParticipants((prev) => prev.filter((p) => p.memberId !== peerId));
          },
        },
      });
      engineRef.current = engine;
      engine.setMicGain(prefsRef.current.micVolume ?? 1);

      await engine.setMicStream(mic);
      if (cam) await engine.setCameraStream(cam);
      cameraStreamRef.current = cam;
      buildLocalPreview(mic, cam);
      setLocalScreenStream(null);

      const withSelf = ensureSelfEntry(initialParticipants, selfId, memberNameRef.current, memberAvatarRef.current);
      setSession(info);
      setSelf({ muted: false, deafened: false, cameraOn: !!cam, sharingScreen: false, micLevel: 0 });
      applyParticipants(withSelf);
      // Announce our state; server rebroadcasts as voice:state.
      sendSocket({
        type: 'voice:state',
        is_muted: false,
        is_deafened: false,
        camera_on: !!cam,
        sharing_screen: false,
        connection_state: 'connected',
      });
    },
    [applyParticipants, buildLocalPreview, sendSocket],
  );

  // ------------------------------------------------------------------ leave

  const leaveLocal = useCallback(
    (friendlyError?: string | null) => {
      engineRef.current?.dispose();
      engineRef.current = null;
      signalCbRef.current = null;
      cameraStreamRef.current = null;
      setLocalStream((prev) => {
        stopStream(prev);
        return null;
      });
      setLocalScreenStream((prev) => {
        stopStream(prev);
        return null;
      });
      setSession(null);
      setParticipants([]);
      setSelf({ muted: false, deafened: false, cameraOn: false, sharingScreen: false, micLevel: 0 });
      setPersonalPin(null);
      setPersonalSpotlight(null);
      setStatus('idle');
      if (friendlyError !== undefined) setError(friendlyError);
    },
    [],
  );

  const leave = useCallback(async () => {
    const hadSession = sessionRef.current != null;
    leaveLocal(null);
    // Tell the server (REST is idempotent; the socket message is instant).
    sendSocket({ type: 'voice:leave' });
    if (hadSession) {
      try {
        await voiceApi.leave();
      } catch {
        /* already gone server-side */
      }
    }
    await refreshChannelsSafe();
  }, [leaveLocal]);

  // Latest-wins: a slow response that started before a newer refresh, or
  // before the account moved to another workspace (a different member row),
  // must not overwrite the current workspace's channels.
  const refreshSeqRef = useRef(0);
  const refreshChannelsSafe = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const forMember = memberIdRef.current;
    const current = () => seq === refreshSeqRef.current && forMember === memberIdRef.current;
    try {
      const list = await voiceApi.getChannels();
      if (current()) setChannels(list);
    } catch {
      /* channels list is best-effort; call UI shows its own empty state */
    }
    // Keep the engine's Opus bitrate in sync with team_voice_settings.
    try {
      const settings = await voiceApi.getSettings();
      if (!current()) return;
      const q = settings?.default_audio_quality;
      if (q === 'low' || q === 'medium' || q === 'high') {
        audioQualityRef.current = q;
        void engineRef.current?.setAudioQuality(q);
      }
    } catch {
      /* settings fetch is best-effort — the engine keeps its current quality */
    }
  }, []);

  const refreshChannels = useCallback(async () => {
    await refreshChannelsSafe();
  }, [refreshChannelsSafe]);

  // ------------------------------------------------------------------- join

  const acquireMicOrThrow = useCallback(async (): Promise<MediaStream> => {
    try {
      const stream = await getMicStream(prefsRef.current.micId, prefsRef.current);
      setMicDenied(false);
      return stream;
    } catch (err) {
      if (err instanceof MediaError && err.code === 'denied') setMicDenied(true);
      throw err;
    }
  }, []);

  const joinChannel = useCallback(
    async (channelId: number, opts?: { video?: boolean }) => {
      const selfId = memberIdRef.current;
      if (selfId == null) {
        setError('Sign in to join a voice channel.');
        return;
      }
      // Switching channels: leave the old session silently first.
      if (sessionRef.current) await leave();
      setStatus('joining');
      setError(null);
      let mic: MediaStream | null = null;
      let cam: MediaStream | null = null;
      try {
        const { session: rawSession, ice } = await voiceApi.joinChannel(channelId);
        // Acquire mic and camera concurrently — video stays optional with
        // audio-only fallback if the camera fails.
        const micPromise = acquireMicOrThrow();
        const camPromise = opts?.video
          ? getCameraStream(prefsRef.current.cameraId, prefsRef.current.cameraQuality ?? 'medium')
          : Promise.resolve(null);
        const [micSettled, camSettled] = await Promise.allSettled([micPromise, camPromise]);
        if (micSettled.status === 'rejected') throw micSettled.reason;
        mic = micSettled.value;
        if (camSettled.status === 'fulfilled' && camSettled.value) {
          cam = camSettled.value;
        } else if (opts?.video && camSettled.status === 'rejected') {
          // Video is optional — join audio-only rather than failing the join,
          // but SAY so: silent audio-only joins read as "video is broken".
          console.warn('[voice] camera unavailable, joining audio-only:', camSettled.reason);
          setError('Camera unavailable — you joined with audio only. Check permissions and toggle the camera to retry.');
        }
        const info: VoiceSessionInfo = {
          id: rawSession.id,
          kind: 'voice_channel',
          channelId,
          name: rawSession.name,
          locked: rawSession.locked,
          globalSpotlightMemberId: rawSession.globalSpotlightMemberId,
        };
        await startEngine(info, ice, mic, cam, rawSession.participants);
        setStatus('connected');
        await refreshChannelsSafe();
      } catch (err: any) {
        stopStream(mic);
        stopStream(cam);
        leaveLocal(null);
        setError(friendlyJoinError(err));
      }
    },
    [acquireMicOrThrow, leave, leaveLocal, refreshChannelsSafe, startEngine],
  );

  // ------------------------------------------------------------------- calls

  const startCall = useCallback(
    async (inviteeIds: number[], media: 'audio' | 'video') => {
      const selfId = memberIdRef.current;
      if (selfId == null) {
        setError('Sign in to start a call.');
        return;
      }
      if (sessionRef.current) {
        setError("You're already in a call — leave it first.");
        return;
      }
      const kind = inviteeIds.length === 1 ? 'dm' : 'group';
      setStatus('joining');
      setError(null);
      let mic: MediaStream | null = null;
      let cam: MediaStream | null = null;
      try {
        const { sessionId, channelId, channelName, ice } = await voiceApi.startCall(inviteeIds, media, kind);
        mic = await acquireMicOrThrow();
        if (media === 'video') {
          try {
            cam = await getCameraStream(prefsRef.current.cameraId, prefsRef.current.cameraQuality ?? 'medium');
          } catch (camErr) {
            console.warn('[voice] camera unavailable, starting audio-only:', camErr);
            setError('Camera unavailable — the call started with audio only. Check permissions and toggle the camera to retry.');
          }
        }
        // Ad-hoc calls are public temp voice channels — anyone can join.
        const info: VoiceSessionInfo = {
          id: sessionId,
          kind: 'voice_channel',
          channelId,
          name: channelName,
          locked: false,
          globalSpotlightMemberId: null,
        };
        await startEngine(info, ice, mic, cam, []);
        setStatus('connected');
      } catch (err: any) {
        stopStream(mic);
        stopStream(cam);
        leaveLocal(null);
        setError(friendlyJoinError(err));
      }
    },
    [acquireMicOrThrow, leaveLocal, startEngine],
  );

  const acceptCall = useCallback(async () => {
    const inv = incomingCallRef.current;
    if (!inv) return;
    // UI offers stay/switch; accepting while in another call switches.
    if (sessionRef.current && sessionRef.current.id !== inv.sessionId) await leave();
    setIncomingCall(null);
    setStatus('joining');
    setError(null);
    let mic: MediaStream | null = null;
    let cam: MediaStream | null = null;
    try {
      const { ice, session: accepted } = await voiceApi.acceptCall(inv.sessionId);
      mic = await acquireMicOrThrow();
      if (inv.media === 'video') {
        try {
          cam = await getCameraStream(prefsRef.current.cameraId, prefsRef.current.cameraQuality ?? 'medium');
        } catch (camErr) {
          console.warn('[voice] camera unavailable, accepting audio-only:', camErr);
          setError('Camera unavailable — you joined with audio only. Check permissions and toggle the camera to retry.');
        }
      }
      // Ad-hoc calls are public temp voice channels — accepting joins the channel.
      const info: VoiceSessionInfo = {
        id: accepted.id,
        kind: 'voice_channel',
        channelId: accepted.channel_id,
        name: accepted.name,
        locked: false,
        globalSpotlightMemberId: null,
      };
      await startEngine(info, ice, mic, cam, []);
      setStatus('connected');
    } catch (err: any) {
      stopStream(mic);
      stopStream(cam);
      leaveLocal(null);
      setError(friendlyJoinError(err));
    }
  }, [acquireMicOrThrow, leave, leaveLocal, startEngine]);

  const declineCall = useCallback(async () => {
    const inv = incomingCallRef.current;
    setIncomingCall(null);
    if (inv) {
      try {
        await voiceApi.declineCall(inv.sessionId);
      } catch {
        /* invite already expired */
      }
    }
  }, []);

  const dismissIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const endCall = useCallback(async () => {
    const s = sessionRef.current;
    const wasRinging = s && s.kind !== 'voice_channel';
    leaveLocal(null);
    if (wasRinging && s) {
      // Stop the ringing on the invitees' side too.
      sendSocket({ type: 'voice:ring-cancel', session_id: s.id });
      try {
        await voiceApi.endCall(s.id);
      } catch {
        /* already ended */
      }
    } else {
      sendSocket({ type: 'voice:leave' });
      try {
        await voiceApi.leave();
      } catch {
        /* ignore */
      }
    }
    await refreshChannelsSafe();
  }, [leaveLocal, refreshChannelsSafe, sendSocket]);

  // ----------------------------------------------------------------- toggles

  const sendState = useCallback(
    (patch: VoiceStatePatch) => {
      sendSocket({ type: 'voice:state', ...patch });
      // Optimistic local reflection for the self tile.
      setSelf((prev) => ({
        ...prev,
        ...(patch.is_muted !== undefined ? { muted: patch.is_muted } : {}),
        ...(patch.is_deafened !== undefined ? { deafened: patch.is_deafened } : {}),
        ...(patch.camera_on !== undefined ? { cameraOn: patch.camera_on } : {}),
        ...(patch.sharing_screen !== undefined ? { sharingScreen: patch.sharing_screen } : {}),
      }));
      setParticipants((prev) =>
        prev.map((p) =>
          p.isSelf
            ? {
                ...p,
                ...(patch.is_muted !== undefined ? { isMuted: patch.is_muted } : {}),
                ...(patch.is_deafened !== undefined ? { isDeafened: patch.is_deafened } : {}),
                ...(patch.camera_on !== undefined ? { cameraOn: patch.camera_on } : {}),
                ...(patch.sharing_screen !== undefined ? { sharingScreen: patch.sharing_screen } : {}),
              }
            : p,
        ),
      );
    },
    [sendSocket],
  );

  const setMicEnabled = useCallback(
    (enabled: boolean) => {
      const track = engineRef.current?.getLocalMicStream()?.getAudioTracks()[0];
      if (track) track.enabled = enabled;
    },
    [],
  );

  const toggleMute = useCallback(() => {
    if (!sessionRef.current) return;
    const next = !selfRef.current.muted;
    setMicEnabled(!next);
    sendState({ is_muted: next });
  }, [sendState, setMicEnabled]);

  const toggleDeafen = useCallback(() => {
    if (!sessionRef.current) return;
    const next = !selfRef.current.deafened;
    // Discord semantics: deafening also mutes the mic.
    if (next) setMicEnabled(false);
    else if (!selfRef.current.muted) setMicEnabled(true);
    engineRef.current?.setDeafened(next);
    sendState({ is_deafened: next, ...(next ? { is_muted: true } : {}) });
  }, [sendState, setMicEnabled]);

  const toggleCamera = useCallback(async () => {
    if (!sessionRef.current || !engineRef.current) return;
    const turningOn = !selfRef.current.cameraOn;
    try {
      if (turningOn) {
        // User gesture — acquiring the camera here is allowed.
        const cam = await getCameraStream(prefsRef.current.cameraId, prefsRef.current.cameraQuality ?? 'medium');
        await engineRef.current.setCameraStream(cam);
        cameraStreamRef.current = cam;
        const mic = engineRef.current.getLocalMicStream();
        buildLocalPreview(mic, cam);
        sendState({ camera_on: true });
      } else {
        await engineRef.current.setCameraStream(null);
        cameraStreamRef.current = null;
        const mic = engineRef.current.getLocalMicStream();
        buildLocalPreview(mic, null);
        sendState({ camera_on: false });
      }
    } catch (err: any) {
      setError(err instanceof MediaError ? err.message : 'Could not access the camera.');
    }
  }, [buildLocalPreview, sendState]);

  const toggleScreenShare = useCallback(async () => {
    if (!sessionRef.current || !engineRef.current) return;
    const turningOn = !selfRef.current.sharingScreen;
    try {
      if (turningOn) {
        // User gesture — getDisplayMedia must be called from one.
        const screen = await getScreenStream();
        const track = screen.getVideoTracks()[0];
        // If the user stops sharing from the browser chrome, reflect it.
        if (track) {
          track.onended = () => {
            if (selfRef.current.sharingScreen) void toggleScreenShareRef.current();
          };
        }
        await engineRef.current.setScreenStream(screen);
        setLocalScreenStream(screen);
        sendState({ sharing_screen: true });
      } else {
        await engineRef.current.setScreenStream(null);
        setLocalScreenStream((prev) => {
          stopStream(prev);
          return null;
        });
        sendState({ sharing_screen: false });
      }
    } catch (err: any) {
      if (err instanceof MediaError && err.code === 'denied') return; // user cancelled the picker — not an error
      setError(err instanceof MediaError ? err.message : 'Could not start screen sharing.');
    }
  }, [sendState]);

  // Self-reference for the onended handler above (avoids stale closure).
  const toggleScreenShareRef = useRef(toggleScreenShare);
  toggleScreenShareRef.current = toggleScreenShare;

  // ---------------------------------------------------------------- moderate

  const moderate = useCallback(
    async (
      action: ModerationAction,
      targetMemberId: number,
      extra?: { targetChannelId?: number; reason?: string },
    ) => {
      const s = sessionRef.current;
      if (!s) {
        setError('Join a call first.');
        return;
      }
      try {
        await voiceApi.moderate(action, s.id, targetMemberId, extra);
      } catch (err: any) {
        setError(err?.message || 'Moderation action failed.');
      }
    },
    [],
  );

  // ------------------------------------------------------------------ devices

  const setDevice = useCallback((kind: SetDeviceKind, deviceId: string | undefined) => {
    setPrefs((prev) => {
      const next: DevicePrefs = {
        ...prev,
        ...(kind === 'mic' ? { micId: deviceId } : {}),
        ...(kind === 'camera' ? { cameraId: deviceId } : {}),
        ...(kind === 'speaker' ? { speakerId: deviceId } : {}),
      };
      saveDevicePrefs(next);
      return next;
    });
    // Live-switch mid-call without renegotiation (mic/camera only; the
    // speakerId applies to the UI's audio output elements).
    const engine = engineRef.current;
    if (!engine) return;
    if (kind === 'mic') {
      getMicStream(deviceId, prefsRef.current)
        .then((stream) => {
          const enabled = !selfRef.current.muted;
          stream.getAudioTracks().forEach((t) => (t.enabled = enabled));
          return engine.setMicStream(stream).then(() => {
            buildLocalPreview(stream, cameraStreamRef.current);
          });
        })
        .catch((err) => setError(err instanceof MediaError ? err.message : 'Could not switch microphone.'));
    } else if (kind === 'camera' && selfRef.current.cameraOn) {
      getCameraStream(deviceId, prefsRef.current.cameraQuality ?? 'medium')
        .then((stream) =>
          engine.setCameraStream(stream).then(() => {
            cameraStreamRef.current = stream;
            buildLocalPreview(engine.getLocalMicStream(), stream);
          }),
        )
        .catch((err) => setError(err instanceof MediaError ? err.message : 'Could not switch camera.'));
    }
  }, [buildLocalPreview]);

  // ------------------------------------------------------- socket integration

  const attachSocket = useCallback(
    (send: (msg: any) => void) => {
      sendRef.current = send;
      // Re-announce state so a reconnected socket converges immediately.
      const s = sessionRef.current;
      if (s) {
        const cur = selfRef.current;
        send({
          type: 'voice:state',
          is_muted: cur.muted,
          is_deafened: cur.deafened,
          camera_on: cur.cameraOn,
          sharing_screen: cur.sharingScreen,
          connection_state: 'connected',
        });
      }
    },
    [],
  );

  const detachSocket = useCallback(() => {
    sendRef.current = null;
  }, []);

  /** Enforce a moderator action that targets the local user. */
  const enforceModerationOnSelf = useCallback(
    (action: string) => {
      switch (action) {
        case 'mute':
          setMicEnabled(false);
          sendState({ is_muted: true });
          setError('A moderator muted you.');
          break;
        case 'deafen':
          setMicEnabled(false);
          engineRef.current?.setDeafened(true);
          sendState({ is_deafened: true, is_muted: true });
          setError('A moderator deafened you.');
          break;
        case 'disable_video':
          if (selfRef.current.cameraOn && engineRef.current) {
            void engineRef.current.setCameraStream(null).then(() => {
              cameraStreamRef.current = null;
              buildLocalPreview(engineRef.current?.getLocalMicStream() ?? null, null);
              sendState({ camera_on: false });
            });
          } else {
            sendState({ camera_on: false });
          }
          setError('A moderator turned off your camera.');
          break;
        case 'stop_screen':
          if (selfRef.current.sharingScreen && engineRef.current) {
            void engineRef.current.setScreenStream(null).then(() => {
              setLocalScreenStream((prev) => {
                stopStream(prev);
                return null;
              });
              sendState({ sharing_screen: false });
            });
          } else {
            sendState({ sharing_screen: false });
          }
          setError('A moderator stopped your screen share.');
          break;
        default:
          break;
      }
    },
    [buildLocalPreview, sendState, setMicEnabled],
  );

  const handleSocketMessage = useCallback(
    (msg: any): boolean => {
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
      if (!msg.type.startsWith('voice:')) return false;
      const selfId = memberIdRef.current;

      switch (msg.type) {
        case 'voice:signal': {
          const cb = signalCbRef.current;
          if (cb && msg.session_id === sessionRef.current?.id) {
            cb(Number(msg.from_member_id), Number(msg.session_id), msg.payload);
          }
          return true;
        }
        case 'voice:presence': {
          if (Number(msg.session_id) !== sessionRef.current?.id) return true; // another channel's session
          const raw = Array.isArray(msg.participants) ? msg.participants : [];
          applyParticipants(raw);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  locked: msg.locked === true,
                  globalSpotlightMemberId:
                    msg.global_spotlight_member_id != null ? Number(msg.global_spotlight_member_id) : null,
                }
              : prev,
          );
          return true;
        }
        case 'voice:state': {
          if (Number(msg.session_id) !== sessionRef.current?.id) return true;
          const targetId = Number(msg.member_id);
          const state = msg.state ?? {};
          setParticipants((prev) =>
            prev.map((p) =>
              p.memberId === targetId
                ? {
                    ...p,
                    ...(state.is_muted !== undefined ? { isMuted: state.is_muted === 1 } : {}),
                    ...(state.is_deafened !== undefined ? { isDeafened: state.is_deafened === 1 } : {}),
                    ...(state.camera_on !== undefined ? { cameraOn: state.camera_on === 1 } : {}),
                    ...(state.sharing_screen !== undefined ? { sharingScreen: state.sharing_screen === 1 } : {}),
                  }
                : p,
            ),
          );
          if (targetId === selfId) {
            // Server is the source of truth — converge local flags and hardware.
            const cur = selfRef.current;
            if (state.is_muted !== undefined && (state.is_muted === 1) !== cur.muted) {
              const muted = state.is_muted === 1;
              setMicEnabled(!muted);
              setSelf((p) => ({ ...p, muted }));
            }
            if (state.is_deafened !== undefined && (state.is_deafened === 1) !== cur.deafened) {
              const deafened = state.is_deafened === 1;
              engineRef.current?.setDeafened(deafened);
              setSelf((p) => ({ ...p, deafened }));
            }
            if (state.camera_on !== undefined && (state.camera_on === 1) !== cur.cameraOn) {
              const on = state.camera_on === 1;
              setSelf((p) => ({ ...p, cameraOn: on }));
              if (!on && engineRef.current) {
                cameraStreamRef.current = null;
                void engineRef.current.setCameraStream(null).then(() => {
                  buildLocalPreview(engineRef.current?.getLocalMicStream() ?? null, null);
                });
              }
            }
            if (state.sharing_screen !== undefined && (state.sharing_screen === 1) !== cur.sharingScreen) {
              const on = state.sharing_screen === 1;
              setSelf((p) => ({ ...p, sharingScreen: on }));
              if (!on && engineRef.current) {
                void engineRef.current.setScreenStream(null).then(() => {
                  setLocalScreenStream((prev) => {
                    stopStream(prev);
                    return null;
                  });
                });
              }
            }
          }
          return true;
        }
        case 'voice:moderated': {
          if (Number(msg.session_id) !== sessionRef.current?.id) return true;
          if (Number(msg.target_member_id) === selfId) {
            enforceModerationOnSelf(String(msg.action));
          }
          // Everyone else's tiles converge via the follow-up voice:presence.
          return true;
        }
        case 'voice:kicked': {
          if (Number(msg.session_id) !== sessionRef.current?.id) return true;
          const reason = String(msg.reason ?? '');
          leaveLocal(reason === 'ended' ? 'The call was ended.' : 'You were removed from the call.');
          void refreshChannelsSafe();
          return true;
        }
        case 'voice:session-ended': {
          if (Number(msg.session_id) !== sessionRef.current?.id) return true;
          leaveLocal(null);
          void refreshChannelsSafe();
          return true;
        }
        case 'voice:channel-created':
        case 'voice:channel-deleted': {
          // Temp call channels appear/disappear live; refresh the sidebar list.
          void refreshChannelsSafe();
          return true;
        }
        case 'voice:incoming': {
          // Even when already in a call we keep it — the UI offers stay/switch. Never auto-switch.
          setIncomingCall({
            inviteId: Number(msg.invite_id),
            sessionId: Number(msg.session_id),
            kind: msg.kind === 'group' ? 'group' : 'dm',
            media: msg.media === 'video' ? 'video' : 'audio',
            channelId: msg.channel_id != null ? Number(msg.channel_id) : null,
            channelName: msg.channel_name != null ? String(msg.channel_name) : null,
            inviter: { id: Number(msg.inviter?.id), name: String(msg.inviter?.name ?? 'Someone') },
          });
          return true;
        }
        case 'voice:ring-cancelled': {
          if (incomingCallRef.current && Number(msg.session_id) === incomingCallRef.current.sessionId) {
            setIncomingCall(null);
          }
          return true;
        }
        case 'voice:invite-accepted':
        case 'voice:invite-declined':
          // Caller-side notices; presence/state updates carry the real change.
          if (msg.type === 'voice:invite-declined') {
            setError('They declined the call.');
          }
          return true;
        case 'voice:error': {
          setError(String(msg.error ?? 'Voice error'));
          return true;
        }
        default:
          return true; // unknown voice:* type — claimed so App doesn't misroute it
      }
    },
    [applyParticipants, buildLocalPreview, enforceModerationOnSelf, leaveLocal, refreshChannelsSafe, setMicEnabled],
  );

  // ------------------------------------------------------------- side effects

  // Load channels + device list when signed in.
  useEffect(() => {
    if (memberId == null) return;
    void refreshChannelsSafe();
    void enumerateDevices().then(setDevices).catch(() => {});
    const off = onDeviceChange(() => {
      void enumerateDevices().then(setDevices).catch(() => {});
    });
    return off;
  }, [memberId, refreshChannelsSafe]);

  // Tear down the engine if the provider unmounts mid-call.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const value: VoiceContextValue = {
    status,
    session,
    participants,
    self,
    channels,
    incomingCall,
    personalPin,
    personalSpotlight,
    expanded,
    localStream,
    localScreenStream,
    devices,
    selectedDevices,
    setDevice,
    devicePrefs: prefs,
    setDevicePrefs,
    canModerate,
    canManageVoice,
    micDenied,
    error,
    joinChannel,
    leave,
    startCall,
    acceptCall,
    declineCall,
    dismissIncomingCall,
    endCall,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    sendState,
    setPersonalPin,
    setPersonalSpotlight,
    setExpanded,
    moderate,
    refreshChannels,
    clearError,
    attachSocket,
    detachSocket,
    handleSocketMessage,
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

// ---------------------------------------------------------------------------
// helpers

function friendlyJoinError(err: any): string {
  if (err instanceof MediaError) return err.message;
  const msg = String(err?.message ?? '');
  if (/already in another call/i.test(msg)) return "You're already in another call.";
  if (/full/i.test(msg)) return 'This voice channel is full.';
  if (/locked/i.test(msg)) return 'This voice channel is locked.';
  if (/permission/i.test(msg)) return "You don't have permission to join this voice channel.";
  if (/not found/i.test(msg)) return 'Voice channel not found.';
  return msg || 'Could not join the call.';
}

/** Ensure the self entry exists in a freshly-joined participant list. */
function ensureSelfEntry(
  raw: Array<{
    member_id: number; name: string; avatar_url: string | null;
    is_muted: boolean; is_deafened: boolean; camera_on: boolean; sharing_screen: boolean;
    joined_at?: string;
  }>,
  selfId: number,
  selfName: string,
  selfAvatar: string | null,
) {
  if (raw.some((p) => p.member_id === selfId)) return raw;
  return [
    ...raw,
    {
      member_id: selfId,
      name: selfName || 'You',
      avatar_url: selfAvatar,
      is_muted: false,
      is_deafened: false,
      camera_on: false,
      sharing_screen: false,
    },
  ];
}

// Re-exported so tests and future UI can import from the context module.
export { DEFAULT_DEVICE_PREFS };
