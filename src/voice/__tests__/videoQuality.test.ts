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
