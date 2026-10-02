// Full-mesh P2P WebRTC engine for Control Point voice/video calls.
//
// Architecture note: everything signaling-related goes through the
// `VoiceSignaling` interface below. Today it is implemented over the app's
// single websocket (voice:signal relay in server/voice.ts); tomorrow it can
// be reimplemented on an SFU (LiveKit / mediasoup) without touching the call
// UI, because the UI only consumes the callbacks on VoiceEngineEvents.
//
// Privacy: SDP and ICE candidates are relayed in memory and never persisted
// or logged. No audio/video is recorded — there is no MediaRecorder anywhere
// in this module.
//
// Glare rule: the participant with the HIGHER member id creates the offer;
// the LOWER member id is the "polite" peer and waits for the offer
// (see shouldCreateOffer in ./types). Both sides compute the same answer,
// so no extra round-trip is needed to elect an offerer.
//
// Screen-share track convention: the sender always adds the camera track
// BEFORE the screen track. The receiver therefore treats the FIRST remote
// video track as the camera and the SECOND remote video track as the screen
// share. This is deterministic, documented, and survives renegotiation.

import {
  isVoiceActive,
  shouldCreateOffer,
  validateSignalPayload,
  type ConnectionQuality,
  type SignalPayload,
} from './types';

/** Signaling transport. The default implementation lives in VoiceContext and rides the app websocket. */
export interface VoiceSignaling {
  /** Relay one signal payload to a specific participant. */
  sendSignal(toMemberId: number, payload: SignalPayload): void;
  /** Register the inbound-signal callback. Returns an unsubscribe function. */
  onSignal(cb: (fromMemberId: number, sessionId: number, payload: SignalPayload) => void): () => void;
}

export interface VoiceEngineEvents {
  /** A remote participant's media changed: camera stream, screen stream, or both. Null streams mean the track ended. */
  onRemoteStreams?(memberId: number, stream: MediaStream | null, screenStream: MediaStream | null): void;
  /** Speaking indicator flipped for a participant (includes the local user as selfMemberId). */
  onSpeaking?(memberId: number, speaking: boolean): void;
  /** Local mic level 0..1 for the level meter, throttled by the engine. */
  onMicLevel?(level: number): void;
  /** Connection-quality bucket for one peer, recomputed from getStats. */
  onConnectionQuality?(memberId: number, quality: ConnectionQuality): void;
  /** A peer exhausted its ICE restarts; UI may show a "connection issues" notice. */
  onPeerFailed?(memberId: number): void;
  /** A remote participant hung up / vanished; UI can drop their tile immediately. */
  onPeerLeft?(memberId: number): void;
}

export interface VoiceEngineOptions {
  selfMemberId: number;
  iceServers: RTCIceServer[];
  signaling: VoiceSignaling;
  events?: VoiceEngineEvents;
  /**
   * Team's default audio quality (from team_voice_settings.default_audio_quality).
   * Applied as the Opus maxbitrate on every audio RTCRtpSender via
   * setParameters: low -> 24000, medium -> 64000, high -> 128000 bps.
   * No renegotiation needed — setParameters applies live.
   */
  audioQuality?: 'low' | 'medium' | 'high';
}

/** Opus maxbitrate (bps) per audio quality setting. */
export const AUDIO_QUALITY_BITRATES: Record<'low' | 'medium' | 'high', number> = {
  low: 24000,
  medium: 64000,
  high: 128000,
};

interface PeerState {
  memberId: number;
  pc: RTCPeerConnection;
  /** true when this side is allowed to create offers for this peer. */
  offerer: boolean;
  /** Perfect-negotiation bookkeeping. */
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Local senders so tracks can be replaced/swapped without renegotiation. */
  micSender: RTCRtpSender | null;
  cameraSender: RTCRtpSender | null;
  screenSender: RTCRtpSender | null;
  /** Remote video tracks in arrival order: [camera?, screen?]. */
  remoteVideoTracks: MediaStreamTrack[];
  remoteStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  /** Audio analyser chain for speaking detection + deafen. */
  analyser: AnalyserNode | null;
  audioSource: MediaStreamAudioSourceNode | null;
  speaking: boolean;
  lastVoiceAt: number;
  quality: ConnectionQuality;
  qualityTimer: ReturnType<typeof setInterval> | null;
  /** ICE restart attempts with backoff; gives up after MAX_ICE_RESTARTS. */
  restartAttempts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

const MAX_ICE_RESTARTS = 3;
const ICE_RESTART_BASE_MS = 1500;
/** Speaking hangover: keep the indicator on this long after voice stops, to avoid flicker. */
const SPEAKING_HANGOVER_MS = 500;
const STATS_INTERVAL_MS = 5000;

function getPeerConnectionCtor(): typeof RTCPeerConnection | null {
  try {
    if (typeof RTCPeerConnection !== 'undefined') return RTCPeerConnection;
  } catch {
    /* ignore */
  }
  return null;
}

function rmsFromAnalyser(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export class VoiceEngine {
  private selfId: number;
  private iceServers: RTCIceServer[];
  private signaling: VoiceSignaling;
  private events: VoiceEngineEvents;
  private unsubscribeSignal: (() => void) | null = null;

  private peers = new Map<number, PeerState>();

  private micStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSpeaking = false;
  private localLastVoiceAt = 0;
  private analyserTimer: ReturnType<typeof setInterval> | null = null;
  private lastMicLevelEmit = 0;

  private deafened = false;
  private disposed = false;
  private audioQuality: 'low' | 'medium' | 'high' = 'medium';

  // Mic input-gain chain: raw mic -> GainNode -> MediaStreamDestination.
  // Peers receive the destination track so the input-volume slider (0..2x)
  // actually changes what others hear. The raw stream stays on micStream
  // for the local preview / level meter.
  private micGainNode: GainNode | null = null;
  private micGainSrc: MediaStreamAudioSourceNode | null = null;
  private micGainDest: MediaStreamAudioDestinationNode | null = null;
  private micGainValue = 1;

  constructor(opts: VoiceEngineOptions) {
    this.selfId = opts.selfMemberId;
    this.iceServers = opts.iceServers ?? [];
    this.signaling = opts.signaling;
    this.events = opts.events ?? {};
    if (opts.audioQuality) this.audioQuality = opts.audioQuality;
    this.unsubscribeSignal = this.signaling.onSignal((from, _sessionId, payload) =>
      this.handleSignal(from, payload),
    );
  }

  // ------------------------------------------------------------------ peers

  /**
   * Reconcile peer connections with the authoritative participant list
   * (from REST join or voice:presence). Creates offers for new remotes when
   * this side is the offerer; closes peers for participants who left.
   */
  syncPeers(remoteMemberIds: number[]): void {
    if (this.disposed) return;
    const wanted = new Set(remoteMemberIds.filter((id) => id !== this.selfId));
    for (const id of wanted) {
      if (!this.peers.has(id)) this.createPeer(id);
    }
    for (const id of [...this.peers.keys()]) {
      if (!wanted.has(id)) this.removePeer(id, true);
    }
  }

  private createPeer(remoteId: number): PeerState | null {
    const RTCPeerConnectionCtor = getPeerConnectionCtor();
    if (!RTCPeerConnectionCtor) return null;
    const pc = new RTCPeerConnectionCtor({ iceServers: this.iceServers });

    const peer: PeerState = {
      memberId: remoteId,
      pc,
      offerer: shouldCreateOffer(this.selfId, remoteId),
      makingOffer: false,
      ignoreOffer: false,
      micSender: null,
      cameraSender: null,
      screenSender: null,
      remoteVideoTracks: [],
      remoteStream: null,
      remoteScreenStream: null,
      analyser: null,
      audioSource: null,
      speaking: false,
      lastVoiceAt: 0,
      quality: 'unknown',
      qualityTimer: null,
      restartAttempts: 0,
      restartTimer: null,
      closed: false,
    };
    this.peers.set(remoteId, peer);

    // Attach current local tracks to the new peer.
    const micTrack = this.micStream?.getAudioTracks()[0];
    if (micTrack) {
      peer.micSender = pc.addTrack(micTrack, this.micStream!);
      void this.applyAudioBitrate(peer.micSender);
    }
    const camTrack = this.cameraStream?.getVideoTracks()[0];
    if (camTrack) peer.cameraSender = pc.addTrack(camTrack, this.cameraStream!);
    const screenTrack = this.screenStream?.getVideoTracks()[0];
    if (screenTrack) peer.screenSender = pc.addTrack(screenTrack, this.screenStream!);

    pc.onicecandidate = (ev) => {
      if (ev.candidate && ev.candidate.candidate) {
        this.signaling.sendSignal(remoteId, {
          kind: 'ice',
          candidate: JSON.stringify(ev.candidate.toJSON()),
        });
      }
    };

    pc.ontrack = (ev) => this.handleRemoteTrack(peer, ev);

    pc.onnegotiationneeded = () => {
      // Only the offerer initiates; the polite peer waits for the offer.
      if (peer.offerer) void this.negotiate(peer);
    };

    pc.oniceconnectionstatechange = () => this.handleIceStateChange(peer);

    peer.qualityTimer = setInterval(() => void this.pollQuality(peer), STATS_INTERVAL_MS);

    // The offerer kicks off the handshake as soon as the peer exists.
    if (peer.offerer) void this.negotiate(peer);
    return peer;
  }

  private removePeer(remoteId: number, notify: boolean): void {
    const peer = this.peers.get(remoteId);
    if (!peer || peer.closed) return;
    peer.closed = true;
    if (peer.qualityTimer) clearInterval(peer.qualityTimer);
    if (peer.restartTimer) clearTimeout(peer.restartTimer);
    this.teardownPeerAudio(peer);
    try {
      peer.pc.close();
    } catch {
      /* ignore */
    }
    this.peers.delete(remoteId);
    if (notify) this.events.onPeerLeft?.(remoteId);
  }

  private async negotiate(peer: PeerState): Promise<void> {
    if (peer.closed || this.disposed) return;
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      const desc = peer.pc.localDescription;
      if (desc?.type === 'offer') {
        this.signaling.sendSignal(peer.memberId, { kind: 'offer', sdp: desc.sdp ?? '', type: 'offer' });
      } else if (desc?.type === 'answer') {
        this.signaling.sendSignal(peer.memberId, { kind: 'answer', sdp: desc.sdp ?? '', type: 'answer' });
      }
    } catch {
      /* negotiation collisions resolve via the polite-peer path */
    } finally {
      peer.makingOffer = false;
    }
  }

  private async handleSignal(fromMemberId: number, payload: SignalPayload): Promise<void> {
    if (this.disposed || fromMemberId === this.selfId) return;
    const err = validateSignalPayload(payload);
    if (err) return; // drop malformed signals silently — never crash on them

    let peer = this.peers.get(fromMemberId);
    if (!peer) {
      // A signal from someone we don't know yet (presence race): create the
      // peer shell so we can answer; syncPeers() will converge shortly.
      const created = this.createPeer(fromMemberId);
      if (!created) return;
      peer = created;
    }

    try {
      if (payload.kind === 'ice') {
        const init = payload.candidate ? JSON.parse(payload.candidate) : null;
        if (init) await peer.pc.addIceCandidate(new RTCIceCandidate(init));
        else await peer.pc.addIceCandidate(null as any); // end-of-candidates
        return;
      }

      // SDP offer/answer. Perfect-negotiation collision handling:
      const offerCollision =
        payload.type === 'offer' && (peer.makingOffer || peer.pc.signalingState !== 'stable');
      peer.ignoreOffer = !shouldCreateOffer(this.selfId, fromMemberId) ? false : offerCollision;
      if (offerCollision && !peer.offerer) {
        // Polite peer: roll back and accept the remote offer.
        await Promise.all([
          peer.pc.setLocalDescription({ type: 'rollback' } as any),
          peer.pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp } as any),
        ]);
      } else if (offerCollision && peer.offerer) {
        // Impolite peer with a collision: ignore the incoming offer, ours wins.
        return;
      } else {
        await peer.pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp } as any);
      }

      if (payload.type === 'offer') {
        await peer.pc.setLocalDescription();
        const desc = peer.pc.localDescription;
        if (desc?.type === 'answer') {
          this.signaling.sendSignal(fromMemberId, { kind: 'answer', sdp: desc.sdp ?? '', type: 'answer' });
        }
      }
    } catch {
      /* a stale/duplicate signal is harmless — the handshake converges */
    }
  }

  private handleIceStateChange(peer: PeerState): void {
    if (peer.closed) return;
    const state = peer.pc.iceConnectionState;
    if (state === 'failed') {
      this.scheduleIceRestart(peer);
    } else if (state === 'disconnected') {
      // 'disconnected' often recovers on its own; give it one restart too.
      this.scheduleIceRestart(peer);
    } else if (state === 'connected' || state === 'completed') {
      peer.restartAttempts = 0;
      if (peer.restartTimer) {
        clearTimeout(peer.restartTimer);
        peer.restartTimer = null;
      }
    }
  }

  private scheduleIceRestart(peer: PeerState): void {
    if (peer.closed || peer.restartTimer) return;
    if (peer.restartAttempts >= MAX_ICE_RESTARTS) {
      this.events.onPeerFailed?.(peer.memberId);
      return;
    }
    const delay = ICE_RESTART_BASE_MS * 2 ** peer.restartAttempts;
    peer.restartAttempts += 1;
    peer.restartTimer = setTimeout(() => {
      peer.restartTimer = null;
      if (peer.closed || this.disposed) return;
      try {
        // restartIce() re-gathers candidates and triggers renegotiation via
        // onnegotiationneeded; only the offerer drives it.
        peer.pc.restartIce();
        if (peer.offerer) void this.negotiate(peer);
      } catch {
        this.scheduleIceRestart(peer);
      }
    }, delay);
  }

  // ------------------------------------------------------------ remote media

  private handleRemoteTrack(peer: PeerState, ev: RTCTrackEvent): void {
    const track = ev.track;
    if (track.kind === 'audio') {
      if (!peer.remoteStream) peer.remoteStream = new MediaStream();
      if (!peer.remoteStream.getTrackById(track.id)) peer.remoteStream.addTrack(track);
      this.setupPeerAudio(peer, track);
    } else if (track.kind === 'video') {
      // Track-order convention: first video track = camera, second = screen.
      if (!peer.remoteVideoTracks.some((t) => t.id === track.id)) {
        peer.remoteVideoTracks.push(track);
      }
      this.rebuildRemoteVideo(peer);
    }
    track.onended = () => this.handleRemoteTrackEnded(peer, track);
    track.onmute = () => {}; // no-op; unmute re-fires ontrack state implicitly
    this.emitRemoteStreams(peer);
  }

  private handleRemoteTrackEnded(peer: PeerState, track: MediaStreamTrack): void {
    if (track.kind === 'video') {
      peer.remoteVideoTracks = peer.remoteVideoTracks.filter((t) => t.id !== track.id);
      this.rebuildRemoteVideo(peer);
      this.emitRemoteStreams(peer);
    } else if (track.kind === 'audio') {
      peer.remoteStream?.removeTrack(track);
      this.teardownPeerAudio(peer);
      this.emitRemoteStreams(peer);
    }
  }

  /** Split remote video tracks into camera stream + screen stream by arrival order. */
  private rebuildRemoteVideo(peer: PeerState): void {
    const [camera, screen] = peer.remoteVideoTracks;
    if (camera) {
      if (!peer.remoteStream) peer.remoteStream = new MediaStream();
      if (!peer.remoteStream.getTrackById(camera.id)) peer.remoteStream.addTrack(camera);
    } else {
      peer.remoteStream?.getVideoTracks().forEach((t) => peer.remoteStream!.removeTrack(t));
    }
    if (screen) {
      if (!peer.remoteScreenStream) peer.remoteScreenStream = new MediaStream();
      if (!peer.remoteScreenStream.getTrackById(screen.id)) peer.remoteScreenStream.addTrack(screen);
    } else if (peer.remoteScreenStream) {
      peer.remoteScreenStream.getTracks().forEach((t) => peer.remoteScreenStream!.removeTrack(t));
      peer.remoteScreenStream = null;
    }
  }

  private emitRemoteStreams(peer: PeerState): void {
    const hasMedia =
      (peer.remoteStream && peer.remoteStream.getTracks().length > 0) ||
      (peer.remoteScreenStream && peer.remoteScreenStream.getTracks().length > 0);
    this.events.onRemoteStreams?.(
      peer.memberId,
      hasMedia ? peer.remoteStream : null,
      peer.remoteScreenStream,
    );
  }

  // ------------------------------------------------------------ local tracks

  /**
   * Change the team's audio quality mid-call. Applies the matching Opus
   * maxbitrate to every live audio sender via setParameters (no
   * renegotiation, no SDP changes, nothing persisted).
   */
  async setAudioQuality(quality: 'low' | 'medium' | 'high'): Promise<void> {
    if (!['low', 'medium', 'high'].includes(quality)) return;
    this.audioQuality = quality;
    await Promise.all(
      [...this.peers.values()].map((peer) =>
        peer.micSender ? this.applyAudioBitrate(peer.micSender) : Promise.resolve(),
      ),
    );
  }

  /** Apply the current Opus maxbitrate to one audio RTCRtpSender. */
  private async applyAudioBitrate(sender: RTCRtpSender): Promise<void> {
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      const bitrate = AUDIO_QUALITY_BITRATES[this.audioQuality] ?? AUDIO_QUALITY_BITRATES.medium;
      for (const enc of params.encodings) enc.maxBitrate = bitrate;
      await sender.setParameters(params);
    } catch {
      /* sender/encoding API unsupported — the Opus default stands */
    }
  }

  /** Attach the local mic stream; replaces the mic track on every peer without renegotiation. */
  async setMicStream(stream: MediaStream | null): Promise<void> {
    const old = this.micStream;
    this.micStream = stream;
    const track = this.routeMicThroughGain(stream);
    const sendStream = (track && this.micGainDest) ? this.micGainDest.stream : stream;
    for (const peer of this.peers.values()) {
      if (track && peer.micSender) {
        try {
          await peer.micSender.replaceTrack(track);
        } catch {
          peer.micSender = peer.pc.addTrack(track, sendStream!);
          void this.applyAudioBitrate(peer.micSender);
        }
      } else if (track && !peer.micSender) {
        peer.micSender = peer.pc.addTrack(track, sendStream!);
        void this.applyAudioBitrate(peer.micSender);
      } else if (!track && peer.micSender) {
        try {
          peer.pc.removeTrack(peer.micSender);
        } catch {
          /* ignore */
        }
        peer.micSender = null;
      }
    }
    if (old && old !== stream) for (const t of old.getTracks()) t.stop();
    this.setupLocalAnalyser();
  }

  /**
   * Live input-gain control (0..2, 1 = unity). Applies immediately to the
   * gain node when one exists; otherwise stored for the next setMicStream.
   */
  setMicGain(volume: number): void {
    const v = Number.isFinite(volume) ? Math.min(2, Math.max(0, volume)) : 1;
    this.micGainValue = v;
    const node = this.micGainNode;
    const ctx = this.audioCtx;
    if (node && ctx) {
      try {
        node.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
      } catch {
        try {
          node.gain.value = v;
        } catch {
          /* ignore */
        }
      }
    }
  }

  /**
   * Route the mic through the gain chain. Returns the track peers should
   * send (the destination track), or the raw track when WebAudio is
   * unavailable. The previous source node is always disconnected first.
   */
  private routeMicThroughGain(stream: MediaStream | null): MediaStreamTrack | null {
    const raw = stream?.getAudioTracks()[0] ?? null;
    if (this.micGainSrc) {
      try {
        this.micGainSrc.disconnect();
      } catch {
        /* ignore */
      }
      this.micGainSrc = null;
    }
    if (!raw) return null;
    const ctx = this.ensureAudioCtx();
    if (!ctx) return raw;
    try {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      if (!this.micGainNode || !this.micGainDest) {
        this.micGainNode = ctx.createGain();
        this.micGainNode.gain.value = this.micGainValue;
        this.micGainDest = ctx.createMediaStreamDestination();
        this.micGainNode.connect(this.micGainDest);
      }
      this.micGainSrc = ctx.createMediaStreamSource(stream!);
      this.micGainSrc.connect(this.micGainNode);
      return this.micGainDest.stream.getAudioTracks()[0] ?? raw;
    } catch {
      return raw;
    }
  }

  /** Attach/detach the local camera; addTrack triggers renegotiation when needed. */
  async setCameraStream(stream: MediaStream | null): Promise<void> {
    const old = this.cameraStream;
    this.cameraStream = stream;
    const track = stream?.getVideoTracks()[0] ?? null;
    for (const peer of this.peers.values()) {
      if (track && peer.cameraSender) {
        try {
          await peer.cameraSender.replaceTrack(track);
        } catch {
          peer.cameraSender = peer.pc.addTrack(track, stream!);
        }
      } else if (track && !peer.cameraSender) {
        // Camera added mid-call: renegotiation required so the remote side
        // learns about the new m-line.
        peer.cameraSender = peer.pc.addTrack(track, stream!);
      } else if (!track && peer.cameraSender) {
        try {
          peer.pc.removeTrack(peer.cameraSender);
        } catch {
          /* ignore */
        }
        peer.cameraSender = null;
      }
    }
    if (old && old !== stream) for (const t of old.getTracks()) t.stop();
  }

  /** Attach/detach the local screen share; same renegotiation rules as camera. */
  async setScreenStream(stream: MediaStream | null): Promise<void> {
    const old = this.screenStream;
    this.screenStream = stream;
    const track = stream?.getVideoTracks()[0] ?? null;
    for (const peer of this.peers.values()) {
      if (track && peer.screenSender) {
        try {
          await peer.screenSender.replaceTrack(track);
        } catch {
          peer.screenSender = peer.pc.addTrack(track, stream!);
        }
      } else if (track && !peer.screenSender) {
        peer.screenSender = peer.pc.addTrack(track, stream!);
      } else if (!track && peer.screenSender) {
        try {
          peer.pc.removeTrack(peer.screenSender);
        } catch {
          /* ignore */
        }
        peer.screenSender = null;
      }
    }
    if (old && old !== stream) for (const t of old.getTracks()) t.stop();
  }

  getLocalMicStream(): MediaStream | null {
    return this.micStream;
  }

  // ------------------------------------------------------------------ deafen

  /**
   * Deafen is LOCAL-ONLY: every remote audio track is disabled in this client
   * (playback stops; video keeps flowing). The remote side keeps sending —
   * deafen never signals anything, matching Discord semantics.
   */
  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    for (const peer of this.peers.values()) {
      peer.remoteStream?.getAudioTracks().forEach((t) => {
        t.enabled = !deafened;
      });
    }
  }

  isDeafened(): boolean {
    return this.deafened;
  }

  // ------------------------------------------------------ speaking detection

  private ensureAudioCtx(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.audioCtx = new AC();
      // Analyser loop shared by local + all remote analysers.
      this.analyserTimer = setInterval(() => this.tickAnalysers(), 100);
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private setupLocalAnalyser(): void {
    this.teardownLocalAnalyser();
    const track = this.micStream?.getAudioTracks()[0];
    if (!track) return;
    const ctx = this.ensureAudioCtx();
    if (!ctx) return;
    try {
      const src = ctx.createMediaStreamSource(this.micStream!);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      // Not connected to destination: analysis only, no feedback loop.
      src.connect(analyser);
      (this as any).localSource = src;
      this.localAnalyser = analyser;
    } catch {
      /* WebAudio unavailable — speaking indicator just stays off */
    }
  }

  private teardownLocalAnalyser(): void {
    try {
      (this as any).localSource?.disconnect();
    } catch {
      /* ignore */
    }
    (this as any).localSource = null;
    this.localAnalyser = null;
    if (this.localSpeaking) {
      this.localSpeaking = false;
      this.events.onSpeaking?.(this.selfId, false);
    }
  }

  private setupPeerAudio(peer: PeerState, track: MediaStreamTrack): void {
    this.teardownPeerAudio(peer);
    const ctx = this.ensureAudioCtx();
    if (!ctx) return;
    try {
      const stream = new MediaStream([track]);
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      peer.audioSource = src;
      peer.analyser = analyser;
    } catch {
      /* ignore */
    }
  }

  private teardownPeerAudio(peer: PeerState): void {
    try {
      peer.audioSource?.disconnect();
    } catch {
      /* ignore */
    }
    peer.audioSource = null;
    peer.analyser = null;
    if (peer.speaking) {
      peer.speaking = false;
      this.events.onSpeaking?.(peer.memberId, false);
    }
  }

  private tickAnalysers(): void {
    if (this.disposed) return;
    const now = Date.now();

    // Local mic.
    if (this.localAnalyser && this.micStream?.getAudioTracks()[0]?.enabled !== false) {
      const active = isVoiceActive(rmsFromAnalyser(this.localAnalyser));
      if (active) this.localLastVoiceAt = now;
      const speaking = now - this.localLastVoiceAt < SPEAKING_HANGOVER_MS;
      if (speaking !== this.localSpeaking) {
        this.localSpeaking = speaking;
        this.events.onSpeaking?.(this.selfId, speaking);
      }
    }
    // Throttled mic-level emission for the level meter (~10/s).
    if (this.localAnalyser && now - this.lastMicLevelEmit > 100) {
      this.lastMicLevelEmit = now;
      this.events.onMicLevel?.(Math.min(1, rmsFromAnalyser(this.localAnalyser) * 4));
    }

    // Remote peers.
    for (const peer of this.peers.values()) {
      if (peer.closed || !peer.analyser) continue;
      const active = isVoiceActive(rmsFromAnalyser(peer.analyser));
      if (active) peer.lastVoiceAt = now;
      const speaking = now - peer.lastVoiceAt < SPEAKING_HANGOVER_MS;
      if (speaking !== peer.speaking) {
        peer.speaking = speaking;
        this.events.onSpeaking?.(peer.memberId, speaking);
      }
    }
  }

  // -------------------------------------------------------- connection stats

  private async pollQuality(peer: PeerState): Promise<void> {
    if (peer.closed || this.disposed) return;
    try {
      const stats = await peer.pc.getStats();
      let rtt = 0;
      let jitter = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let samples = 0;
      stats.forEach((report: any) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (typeof report.currentRoundTripTime === 'number') {
            rtt += report.currentRoundTripTime * 1000;
            samples += 1;
          }
        } else if (report.type === 'inbound-rtp' && !report.isRemote) {
          jitter += report.jitter ?? 0;
          packetsLost += report.packetsLost ?? 0;
          packetsReceived += report.packetsReceived ?? 0;
          samples += 1;
        }
      });
      const avgRtt = samples ? rtt / samples : 0;
      const lossRatio = packetsReceived + packetsLost > 0 ? packetsLost / (packetsReceived + packetsLost) : 0;
      const quality: ConnectionQuality =
        avgRtt > 400 || lossRatio > 0.1 || jitter > 0.05
          ? 'poor'
          : avgRtt > 200 || lossRatio > 0.03 || jitter > 0.02
            ? 'fair'
            : samples > 0
              ? 'good'
              : 'unknown';
      if (quality !== peer.quality) {
        peer.quality = quality;
        this.events.onConnectionQuality?.(peer.memberId, quality);
      }
    } catch {
      /* stats unavailable — keep last quality */
    }
  }

  // ------------------------------------------------------------------ leave

  /**
   * Leave the call and release EVERYTHING: all local tracks stopped, all peer
   * connections closed, all analysers/audio contexts torn down, all timers
   * cleared. Zero leaks — safe to call twice.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of [...this.peers.keys()]) this.removePeer(id, false);
    this.peers.clear();
    if (this.unsubscribeSignal) {
      try {
        this.unsubscribeSignal();
      } catch {
        /* ignore */
      }
      this.unsubscribeSignal = null;
    }
    if (this.analyserTimer) {
      clearInterval(this.analyserTimer);
      this.analyserTimer = null;
    }
    this.teardownLocalAnalyser();
    this.micGainSrc = null;
    this.micGainNode = null;
    this.micGainDest = null;
    for (const s of [this.micStream, this.cameraStream, this.screenStream]) {
      if (s) for (const t of s.getTracks()) try { t.stop(); } catch { /* ignore */ }
    }
    this.micStream = this.cameraStream = this.screenStream = null;
    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      ctx.close().catch(() => {});
    }
  }
}
