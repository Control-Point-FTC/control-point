// Tests for src/utils/sounds.ts — WebAudio is mocked with a fake
// AudioContext class; we verify the localStorage kill switch gates every
// sound and the ringtone loop starts/stops correctly.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SOUND_ENABLED_KEY,
  soundsEnabled,
  setSoundsEnabled,
  playNotificationSound,
  playJoinSound,
  playLeaveSound,
  startRingtone,
  stopRingtone,
  __resetSoundsForTests,
} from '../sounds';

interface FakeOsc {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

const createdOscillators: FakeOsc[] = [];

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  createOscillator = vi.fn((): FakeOsc => {
    const o: FakeOsc = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    createdOscillators.push(o);
    return o;
  });
  createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));
}

describe('sounds', () => {
  beforeEach(() => {
    __resetSoundsForTests();
    localStorage.clear();
    createdOscillators.length = 0;
    (window as any).AudioContext = FakeAudioContext;
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopRingtone();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as any).AudioContext;
  });

  it('defaults to enabled', () => {
    expect(soundsEnabled()).toBe(true);
  });

  it('setSoundsEnabled persists the flag', () => {
    setSoundsEnabled(false);
    expect(localStorage.getItem(SOUND_ENABLED_KEY)).toBe('0');
    expect(soundsEnabled()).toBe(false);
    setSoundsEnabled(true);
    expect(soundsEnabled()).toBe(true);
  });

  it('plays the notification chime when enabled', () => {
    playNotificationSound();
    expect(createdOscillators.length).toBeGreaterThan(0);
    // Two-tone chime: A5 then E6
    const freqs = createdOscillators.map((o) => o.frequency.value);
    expect(freqs).toContain(880);
    expect(freqs).toContain(1318.5);
  });

  it('is a no-op for every sound when disabled', () => {
    setSoundsEnabled(false);
    playNotificationSound();
    playJoinSound();
    playLeaveSound();
    startRingtone();
    expect(createdOscillators.length).toBe(0);
  });

  it('join/leave sounds produce tones when enabled', () => {
    playJoinSound();
    playLeaveSound();
    expect(createdOscillators.length).toBeGreaterThan(0);
  });

  it('startRingtone loops and stopRingtone halts it', () => {
    startRingtone();
    const first = createdOscillators.length;
    expect(first).toBeGreaterThan(0);

    // Starting twice must not double the loop.
    startRingtone();
    vi.advanceTimersByTime(2000);
    const afterTick = createdOscillators.length;
    expect(afterTick).toBeGreaterThan(first);

    stopRingtone();
    const afterStop = createdOscillators.length;
    vi.advanceTimersByTime(10000);
    expect(createdOscillators.length).toBe(afterStop);
  });

  it('disabling sounds stops a running ringtone', () => {
    startRingtone();
    expect(createdOscillators.length).toBeGreaterThan(0);
    setSoundsEnabled(false);
    const count = createdOscillators.length;
    vi.advanceTimersByTime(10000);
    expect(createdOscillators.length).toBe(count);
  });
});
