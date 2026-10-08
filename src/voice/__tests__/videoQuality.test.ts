// Camera and screen share quality: capture resolution hints, "detail" screen
// content, and encoder caps that keep a screen share sharp.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCameraStream, getScreenStream, SCREEN_CONSTRAINTS } from '../media';
import { VoiceEngine, cameraBitrate, SCREEN_BITRATE } from '../webrtc';

const track = (settings: Record<string, number> = {}) => ({ kind: 'video', contentHint: '', stop: vi.fn(), getSettings: () => settings });
const fakeStream = (t = track()) => ({ getTracks: () => [t], getVideoTracks: () => [t] }) as unknown as MediaStream;
const had = navigator.mediaDevices;
afterEach(() => { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: had }); });
const devices = (impl: Record<string, any>) => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: impl });

describe('capture', () => {
  it('asks the camera for a real resolution without forcing an orientation', async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    devices({ getUserMedia });
    await getCameraStream(undefined, 'medium');
    const video = (getUserMedia.mock.calls[0] as any)[0].video;
    expect(video.width).toEqual({ ideal: 1280 });
    expect(video.height).toEqual({ ideal: 1280 });
    await getCameraStream(undefined, 'high');
    expect((getUserMedia.mock.calls[1] as any)[0].video.width).toEqual({ ideal: 1920 });
  });

  it('shares the screen at full resolution, marked as detail', async () => {
    const t = track();
    const getDisplayMedia = vi.fn(async () => fakeStream(t));
    devices({ getUserMedia: vi.fn(), getDisplayMedia });
    await getScreenStream();
    expect((getDisplayMedia.mock.calls[0] as any)[0]).toEqual({ video: SCREEN_CONSTRAINTS, audio: false });
    expect(t.contentHint).toBe('detail');
  });

  it('falls back to a plain share when the constraints are refused', async () => {
    const getDisplayMedia = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('bad'), { name: 'TypeError' }))
      .mockResolvedValueOnce(fakeStream());
    devices({ getUserMedia: vi.fn(), getDisplayMedia });
    await getScreenStream();
    expect((getDisplayMedia.mock.calls[1] as any)[0]).toEqual({ video: true, audio: false });
  });
});

describe('encoder caps', () => {
  const sender = (settings: Record<string, number>) => {
    let params: any = { encodings: [{}] };
    return {
      track: track(settings),
      getParameters: () => params,
      setParameters: vi.fn(async (p: any) => { params = p; }),
      get params() { return params; },
    };
  };
  const apply = (s: any, kind: 'camera' | 'screen') => (VoiceEngine.prototype as any).applyVideoParams.call({}, s, kind);

  it('a screen share keeps its resolution with a high cap', async () => {
    const s = sender({ width: 2560, height: 1440 });
    await apply(s, 'screen');
    expect(s.params.degradationPreference).toBe('maintain-resolution');
    expect(s.params.encodings[0]).toMatchObject({ maxBitrate: SCREEN_BITRATE, maxFramerate: 30, scaleResolutionDownBy: 1 });
  });

  it('a camera gets a cap by its resolution (an upright phone counts like landscape)', async () => {
    const landscape = sender({ width: 1280, height: 720 });
    await apply(landscape, 'camera');
    expect(landscape.params.encodings[0].maxBitrate).toBe(cameraBitrate(720));
    const upright = sender({ width: 720, height: 1280 });
    await apply(upright, 'camera');
    expect(upright.params.encodings[0].maxBitrate).toBe(cameraBitrate(720));
    expect(cameraBitrate(1080)).toBeGreaterThan(cameraBitrate(720));
    expect(cameraBitrate(480)).toBeLessThan(cameraBitrate(720));
  });

  it('an unsupported sender API is ignored', async () => {
    const s = { track: track(), getParameters: () => { throw new Error('nope'); }, setParameters: vi.fn() };
    await expect(apply(s, 'screen')).resolves.toBeUndefined();
    await expect(apply(null, 'camera')).resolves.toBeUndefined();
  });
});

// A peer connection whose senders refuse encoder settings until negotiated
// (empty encodings), like real browsers.
class FakeSender {
  static slow = false;
  negotiated = FakeSender.slow;
  removed = false;
  params: any = { encodings: [] };
  replaceCalls: any[] = [];
  constructor(public track: any) {}
  getParameters() { return this.negotiated ? { ...this.params, encodings: this.params.encodings.length ? this.params.encodings : [{}] } : { encodings: [] }; }
  async setParameters(p: any) {
    if (!this.negotiated) throw new Error('InvalidStateError');
    if (FakeSender.slow) await new Promise((r) => setTimeout(r, 20));
    this.params = p;
  }
  async replaceTrack(t: any) { this.replaceCalls.push(t); await new Promise((r) => setTimeout(r, 5)); this.track = t; }
}
class FakePC {
  static last: FakePC[] = [];
  signalingState = 'have-local-offer';
  senders: FakeSender[] = [];
  listeners: Record<string, (() => void)[]> = {};
  localDescription = null;
  onicecandidate: any; ontrack: any; onnegotiationneeded: any; oniceconnectionstatechange: any;
  constructor() { FakePC.last.push(this); }
  addEventListener(ev: string, fn: () => void) { (this.listeners[ev] ??= []).push(fn); }
  addTrack(track: any) { const s = new FakeSender(track); this.senders.push(s); return s; }
  removeTrack(s: FakeSender) { s.removed = true; }
  async setLocalDescription() {}
  async getStats() { return new Map(); }
  close() {}
  /** Negotiation settles: senders get encodings, listeners hear 'stable'. */
  settle() { this.senders.forEach((s) => { s.negotiated = true; }); this.signalingState = 'stable'; (this.listeners.signalingstatechange ?? []).forEach((f) => f()); }
}

describe('engine: settings after negotiation, and overlapping changes', () => {
  const engineWithPeers = (remotes: number[]) => {
    FakePC.last = [];
    (globalThis as any).RTCPeerConnection = FakePC;
    const engine = new VoiceEngine({ selfMemberId: 1, iceServers: [], signaling: { onSignal: () => () => {}, sendSignal: () => {} } as any });
    engine.syncPeers(remotes);
    return engine;
  };
  afterEach(() => { delete (globalThis as any).RTCPeerConnection; });

  it('a camera turned on mid-call gets its settings once negotiation settles', async () => {
    const engine = engineWithPeers([2]);
    await engine.setCameraStream(fakeStream(track({ width: 1280, height: 720 })));
    const pc = FakePC.last[0];
    const cam = pc.senders[0];
    expect(cam.params.encodings).toEqual([]); // refused before negotiation
    pc.settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(cam.params.encodings[0].maxBitrate).toBe(cameraBitrate(720));
    await engine.setScreenStream(fakeStream(track({ width: 1920, height: 1080 })));
    pc.signalingState = 'have-local-offer';
    pc.settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(pc.senders[1].params).toMatchObject({ degradationPreference: 'maintain-resolution' });
    engine.dispose?.();
  });

  it('turning the camera on then straight off never leaves a (stopped) track on a peer', async () => {
    const engine = engineWithPeers([2, 3, 4]);
    // Negotiated senders whose settings take a while to apply.
    FakeSender.slow = true;
    try {
      const a = track();
      const on = engine.setCameraStream(fakeStream(a));
      const off = engine.setCameraStream(null);
      await Promise.all([on, off]);
      await new Promise((r) => setTimeout(r, 40));
      for (const pc of FakePC.last) expect(pc.senders.filter((x) => !x.removed)).toEqual([]);
      expect(a.stop).toHaveBeenCalled();
    } finally {
      FakeSender.slow = false;
    }
    engine.dispose?.();
  });
});
