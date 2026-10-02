// Pure-logic unit tests for the voice engine. No real media is required:
// RTCPeerConnection and mediaDevices are never touched here.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  shouldCreateOffer,
  validateSignalPayload,
  isVoiceActive,
  SPEAKING_RMS_THRESHOLD,
  loadDevicePrefs,
  saveDevicePrefs,
  mergePresenceParticipants,
  VOICE_PREFS_KEY,
  DEFAULT_DEVICE_PREFS,
  type RawPresenceParticipant,
  type VoiceParticipant,
} from '../types';

describe('shouldCreateOffer (glare avoidance)', () => {
  it('higher member id creates the offer', () => {
    expect(shouldCreateOffer(10, 5)).toBe(true);
  });
  it('lower member id is the polite peer and waits', () => {
    expect(shouldCreateOffer(5, 10)).toBe(false);
  });
  it('is deterministic and symmetric — peers always agree', () => {
    for (const [a, b] of [[1, 2], [42, 7], [100, 1000]]) {
      expect(shouldCreateOffer(a, b)).toBe(!shouldCreateOffer(b, a));
    }
  });
});

describe('validateSignalPayload (client mirror of server validation)', () => {
  it('accepts a valid offer', () => {
    expect(validateSignalPayload({ kind: 'offer', type: 'offer', sdp: 'v=0\r\n' + 'x'.repeat(20) })).toBeNull();
  });
  it('accepts a valid answer', () => {
    expect(validateSignalPayload({ kind: 'answer', type: 'answer', sdp: 'v=0\r\n' + 'y'.repeat(20) })).toBeNull();
  });
  it('accepts a valid ICE candidate', () => {
    expect(validateSignalPayload({ kind: 'ice', candidate: '{"candidate":"a"}' })).toBeNull();
  });
  it('accepts empty ICE candidate (end-of-candidates)', () => {
    expect(validateSignalPayload({ kind: 'ice', candidate: '' })).toBeNull();
  });
  it('rejects unknown kinds', () => {
    expect(validateSignalPayload({ kind: 'bye' })).toBe('Unknown signal kind');
  });
  it('rejects short SDP', () => {
    expect(validateSignalPayload({ kind: 'offer', type: 'offer', sdp: 'v=0' })).toBe('Invalid SDP');
  });
  it('rejects missing SDP', () => {
    expect(validateSignalPayload({ kind: 'answer', type: 'answer' })).toBe('Invalid SDP');
  });
  it('rejects oversized SDP', () => {
    expect(validateSignalPayload({ kind: 'offer', type: 'offer', sdp: 'x'.repeat(200001) })).toBe('Invalid SDP');
  });
  it('rejects oversized ICE candidate', () => {
    expect(validateSignalPayload({ kind: 'ice', candidate: 'x'.repeat(8001) })).toBe('Invalid ICE candidate');
  });
  it('rejects non-objects', () => {
    expect(validateSignalPayload(null)).toBe('Invalid signal payload');
    expect(validateSignalPayload('offer')).toBe('Invalid signal payload');
  });
});

describe('isVoiceActive (speaking threshold)', () => {
  it('silence is not voice', () => {
    expect(isVoiceActive(0)).toBe(false);
    expect(isVoiceActive(0.001)).toBe(false);
  });
  it('loud-enough RMS is voice', () => {
    expect(isVoiceActive(0.05)).toBe(true);
    expect(isVoiceActive(SPEAKING_RMS_THRESHOLD)).toBe(true);
  });
  it('non-finite input is never voice', () => {
    expect(isVoiceActive(NaN)).toBe(false);
    expect(isVoiceActive(Infinity)).toBe(false);
    expect(isVoiceActive(-1)).toBe(false);
  });
  it('honors a custom threshold', () => {
    expect(isVoiceActive(0.05, 0.1)).toBe(false);
    expect(isVoiceActive(0.15, 0.1)).toBe(true);
  });
});

describe('device prefs load/save', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  beforeEach(() => store.clear());

  it('returns defaults when nothing is stored', () => {
    expect(loadDevicePrefs(storage)).toEqual(DEFAULT_DEVICE_PREFS);
  });
  it('round-trips selected devices and toggles', () => {
    const prefs = {
      ...DEFAULT_DEVICE_PREFS,
      micId: 'mic-1',
      cameraId: 'cam-2',
      speakerId: 'spk-3',
      noiseSuppression: false,
      micVolume: 0.5,
    };
    saveDevicePrefs(prefs, storage);
    expect(store.has(VOICE_PREFS_KEY)).toBe(true);
    expect(loadDevicePrefs(storage)).toEqual(prefs);
  });
  it('clamps volumes into range and tolerates garbage', () => {
    saveDevicePrefs({ ...DEFAULT_DEVICE_PREFS, micVolume: 9, speakerVolume: -2 }, storage);
    const loaded = loadDevicePrefs(storage);
    expect(loaded.micVolume).toBe(2);
    expect(loaded.speakerVolume).toBe(0);
  });
  it('keeps a 2x mic boost round-tripping', () => {
    saveDevicePrefs({ ...DEFAULT_DEVICE_PREFS, micVolume: 1.5 }, storage);
    expect(loadDevicePrefs(storage).micVolume).toBe(1.5);
  });
  it('tolerates corrupt JSON', () => {
    store.set(VOICE_PREFS_KEY, '{not json');
    expect(loadDevicePrefs(storage)).toEqual(DEFAULT_DEVICE_PREFS);
  });
});

const raw = (
  member_id: number,
  name: string,
  flags: Partial<Record<'is_muted' | 'is_deafened' | 'camera_on' | 'sharing_screen', boolean>> = {},
): RawPresenceParticipant => ({
  member_id,
  name,
  avatar_url: null,
  is_muted: flags.is_muted ?? false,
  is_deafened: flags.is_deafened ?? false,
  camera_on: flags.camera_on ?? false,
  sharing_screen: flags.sharing_screen ?? false,
  joined_at: '2026-10-01T00:00:00Z',
});

describe('mergePresenceParticipants', () => {
  it('builds the self entry with isSelf and preserves local streams across merges', () => {
    const fakeStream = { id: 'local-mic' } as unknown as MediaStream;
    const prev: VoiceParticipant[] = [
      {
        memberId: 7, name: 'Sushil', avatarUrl: null,
        isMuted: false, isDeafened: false, cameraOn: true, sharingScreen: false,
        speaking: true, connectionQuality: 'good', stream: fakeStream, isSelf: true,
      },
    ];
    const next = mergePresenceParticipants(prev, [raw(7, 'Sushil'), raw(9, 'Rida', { is_muted: true })], 7, 'Sushil', null);
    expect(next).toHaveLength(2);
    const self = next.find((p) => p.memberId === 7)!;
    expect(self.isSelf).toBe(true);
    expect(self.speaking).toBe(true); // preserved local-only state
    expect(self.stream).toBe(fakeStream);
    expect(self.connectionQuality).toBe('good');
    const rida = next.find((p) => p.memberId === 9)!;
    expect(rida.isSelf).toBe(false);
    expect(rida.isMuted).toBe(true);
  });

  it('drops participants who left and adds newcomers', () => {
    const prev: VoiceParticipant[] = [
      { memberId: 7, name: 'Sushil', avatarUrl: null, isMuted: false, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: false, connectionQuality: 'good', isSelf: true },
      { memberId: 9, name: 'Rida', avatarUrl: null, isMuted: false, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: false, connectionQuality: 'good', isSelf: false },
    ];
    const next = mergePresenceParticipants(prev, [raw(7, 'Sushil'), raw(11, 'Lucas', { sharing_screen: true })], 7, 'Sushil', null);
    expect(next.map((p) => p.memberId).sort((a, b) => a - b)).toEqual([7, 11]);
    expect(next.find((p) => p.memberId === 11)!.sharingScreen).toBe(true);
  });

  it('dedupes repeated member ids', () => {
    const next = mergePresenceParticipants([], [raw(7, 'Sushil'), raw(7, 'Sushil')], 7, 'Sushil', null);
    expect(next).toHaveLength(1);
  });

  it('keeps the old self entry if the server presence omits self (join race)', () => {
    const prev: VoiceParticipant[] = [
      { memberId: 7, name: 'Sushil', avatarUrl: null, isMuted: false, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: false, connectionQuality: 'unknown', isSelf: true },
    ];
    const next = mergePresenceParticipants(prev, [raw(9, 'Rida')], 7, 'Sushil', null);
    expect(next.some((p) => p.memberId === 7 && p.isSelf)).toBe(true);
  });
});

describe('localStorage-backed prefs (integration with jsdom storage)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('persists to the real localStorage key', () => {
    saveDevicePrefs({ ...DEFAULT_DEVICE_PREFS, micId: 'abc' });
    const rawJson = localStorage.getItem(VOICE_PREFS_KEY);
    expect(rawJson).toContain('abc');
    expect(loadDevicePrefs().micId).toBe('abc');
  });
});
