// Shared mock plumbing for the voice component tests.
// The '../../voice' module is fully mocked per-test via the __voiceMock
// holder; components under test import { useVoice } (and the admin API)
// from it.

import { vi } from 'vitest';

export function makeVoiceMock(overrides: Record<string, any> = {}): any {
  const fn = (impl?: any) => (impl ? vi.fn(impl) : vi.fn());
  return {
    status: 'idle',
    session: null,
    participants: [],
    self: { muted: false, deafened: false, cameraOn: false, sharingScreen: false, micLevel: 0 },
    channels: [],
    incomingCall: null,
    personalPin: null,
    personalSpotlight: null,
    expanded: false,
    localStream: null,
    localScreenStream: null,
    devices: { audioinputs: [], videoinputs: [], audiooutputs: [] },
    selectedDevices: {},
    devicePrefs: {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      micVolume: 1,
      speakerVolume: 1,
    },
    setDevice: fn(),
    setDevicePrefs: fn(),
    canModerate: false,
    canManageVoice: false,
    micDenied: false,
    error: null,
    joinChannel: fn(async () => {}),
    leave: fn(async () => {}),
    startCall: fn(async () => {}),
    acceptCall: fn(async () => {}),
    declineCall: fn(async () => {}),
    dismissIncomingCall: fn(),
    endCall: fn(async () => {}),
    toggleMute: fn(),
    toggleDeafen: fn(),
    toggleCamera: fn(async () => {}),
    toggleScreenShare: fn(async () => {}),
    sendState: fn(),
    setPersonalPin: fn(),
    setPersonalSpotlight: fn(),
    setExpanded: fn(),
    moderate: fn(async () => {}),
    refreshChannels: fn(async () => {}),
    clearError: fn(),
    attachSocket: fn(),
    detachSocket: fn(),
    handleSocketMessage: fn(() => false),
    ...overrides,
  };
}

export function setVoiceMock(value: any) {
  (globalThis as any).__voiceMock = value;
}
