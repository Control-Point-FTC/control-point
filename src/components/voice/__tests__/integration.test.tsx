// Integration tests for the voice wiring (App.tsx <-> VoiceProvider).
// These compose the REAL VoiceProvider with the REAL call UI (CallBar,
// VoiceChannelList, IncomingCallModal) and mock only the engine layers
// (REST api, media devices, WebRTC engine) — i.e. everything below the
// provider, exactly as App.tsx sees it. This verifies the wiring contract:
//
//   - ws.onmessage: `if (handleSocketMessage(msg)) return;` — voice:*
//     messages are claimed, everything else falls through to App.
//   - ws.onopen / onclose: attachSocket/detachSocket drive the engine's
//     send path (used by leave(), the same call App makes on team
//     switch / logout).
//   - The mounted UI reacts to provider state (channels list, incoming
//     call modal, call bar on join).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';
import { VoiceProvider, useVoice } from '../../../voice';
import { CallBar } from '../CallBar';
import { VoiceChannelList } from '../VoiceChannelList';
import { IncomingCallModal } from '../IncomingCallModal';

// NOTE: vi.hoisted factories run before imports initialize, so the mock
// bundle is defined inline here rather than imported from helpers.
const mocks = vi.hoisted(() => {
  const engineInstances: any[] = [];
  class MockVoiceEngine {
    opts: any;
    disposed = false;
    peers: number[] = [];
    constructor(opts: any) {
      this.opts = opts;
      engineInstances.push(this);
    }
    dispose() {
      this.disposed = true;
    }
    async setMicStream(_s: any) {}
    setMicGain(_v: number) {}
    async setCameraStream(_s: any) {}
    async setScreenStream(_s: any) {}
    setDeafened(_b: boolean) {}
    async setAudioQuality(_q: any) {}
    getLocalMicStream() {
      return (globalThis as any).__micStream ?? null;
    }
    syncPeers(ids: number[]) {
      this.peers = ids;
    }
  }
  class MockMediaError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'MediaError';
      this.code = code;
    }
  }
  return {
    engineInstances,
    MockVoiceEngine,
    MockMediaError,
    voiceApi: {
      getChannels: vi.fn(async () => []),
      getSettings: vi.fn(async () => ({})),
      joinChannel: vi.fn(async () => ({ session: {}, ice: [] })),
      leave: vi.fn(async () => {}),
      startCall: vi.fn(async () => ({ sessionId: 1, invites: [], ice: [] })),
      acceptCall: vi.fn(async () => []),
      declineCall: vi.fn(async () => {}),
      endCall: vi.fn(async () => {}),
      moderate: vi.fn(async () => {}),
    },
    media: {
      enumerateDevices: vi.fn(async () => ({ audioinputs: [], videoinputs: [], audiooutputs: [] })),
      getMicStream: vi.fn(async () => (globalThis as any).__micStream ?? null),
      getCameraStream: vi.fn(async () => null),
      getScreenStream: vi.fn(async () => null),
      onDeviceChange: vi.fn(() => () => {}),
      stopStream: vi.fn(),
    },
  };
});

vi.mock('../../../voice/webrtc', () => ({
  VoiceEngine: mocks.MockVoiceEngine,
  AUDIO_QUALITY_BITRATES: {},
}));
vi.mock('../../../voice/api', () => ({ voiceApi: mocks.voiceApi }));
vi.mock('../../../voice/media', () => ({
  enumerateDevices: mocks.media.enumerateDevices,
  getMicStream: mocks.media.getMicStream,
  getCameraStream: mocks.media.getCameraStream,
  getScreenStream: mocks.media.getScreenStream,
  onDeviceChange: mocks.media.onDeviceChange,
  stopStream: mocks.media.stopStream,
  MediaError: mocks.MockMediaError,
}));

// Minimal MediaStream stand-in (jsdom has none): tracks support `enabled`,
// and the preview builder only needs getAudio/VideoTracks + addTrack.
class FakeMediaStream {
  private tracks: any[];
  constructor(tracks: any[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: any) {
    this.tracks.push(t);
  }
}

const channelSummary = {
  id: 3,
  name: 'Build room',
  description: '',
  maxParticipants: 10,
  locked: false,
  sessionId: null,
  participantCount: 0,
  participants: [],
};

const joinSession = {
  id: 9,
  kind: 'voice_channel',
  channelId: 3,
  name: 'Build room',
  locked: false,
  globalSpotlightMemberId: null,
  participants: [
    {
      member_id: 2,
      name: 'Ash',
      avatar_url: null,
      is_muted: true,
      is_deafened: false,
      camera_on: false,
      sharing_screen: false,
    },
  ],
};

// Captures the live context value, the same way App's VoiceSocketBridge does.
let captured: any = null;
function Capture() {
  captured = useVoice();
  return null;
}

function renderHarness(ui?: React.ReactNode) {
  captured = null;
  return render(
    <VoiceProvider memberId={1} memberName="Sushil" memberAvatar={null} hasPerm={() => true}>
      <Capture />
      {ui ?? (
        <>
          <VoiceChannelList />
          <IncomingCallModal />
          <CallBar />
        </>
      )}
    </VoiceProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engineInstances.length = 0;
  (globalThis as any).__micStream = new FakeMediaStream([{ kind: 'audio', enabled: true }]);
  vi.stubGlobal('MediaStream', FakeMediaStream);
  mocks.voiceApi.getChannels.mockResolvedValue([channelSummary]);
  mocks.voiceApi.joinChannel.mockResolvedValue({ session: joinSession, ice: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (globalThis as any).__micStream;
  captured = null;
});

describe('ws.onmessage routing contract', () => {
  it('claims voice:* messages so App returns early', () => {
    renderHarness();
    expect(captured).not.toBeNull();
    // Claimed (App must `return` before its own branches):
    expect(captured.handleSocketMessage({ type: 'voice:presence', session_id: 9, participants: [] })).toBe(true);
    expect(captured.handleSocketMessage({ type: 'voice:signal', session_id: 9 })).toBe(true);
    expect(captured.handleSocketMessage({ type: 'voice:incoming', invite_id: 1, session_id: 2 })).toBe(true);
    // Unknown voice:* types are claimed too — never misrouted into chat/etc:
    expect(captured.handleSocketMessage({ type: 'voice:future-type' })).toBe(true);
  });

  it('ignores non-voice messages so App handles them', () => {
    renderHarness();
    expect(captured.handleSocketMessage({ type: 'chat', content: 'hi' })).toBe(false);
    expect(captured.handleSocketMessage({ type: 'notification', notification: {} })).toBe(false);
    expect(captured.handleSocketMessage({ type: 'channel_created', channel: {} })).toBe(false);
    expect(captured.handleSocketMessage(null)).toBe(false);
    expect(captured.handleSocketMessage({})).toBe(false);
  });
});

describe('VoiceProvider + call UI', () => {
  it('VoiceChannelList renders channels loaded by the provider', async () => {
    renderHarness();
    await waitFor(() => expect(screen.getByText('Build room')).toBeTruthy());
    expect(mocks.voiceApi.getChannels).toHaveBeenCalled();
  });

  it('voice:incoming shows IncomingCallModal; decline clears it', async () => {
    renderHarness();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => {
      captured.handleSocketMessage({
        type: 'voice:incoming',
        invite_id: 5,
        session_id: 42,
        kind: 'dm',
        media: 'audio',
        inviter: { id: 2, name: 'Rida' },
      });
    });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Rida')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Decline call'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.voiceApi.declineCall).toHaveBeenCalledWith(42);
  });

  it('joining a channel shows CallBar with the session; leave() tears it down over the attached socket', async () => {
    const sent: any[] = [];
    renderHarness();
    await waitFor(() => expect(screen.getByText('Build room')).toBeTruthy());

    // Same attach the app socket does in ws.onopen.
    act(() => {
      captured.attachSocket((m: any) => sent.push(m));
    });

    await act(async () => {
      await captured.joinChannel(3);
    });
    expect(mocks.voiceApi.joinChannel).toHaveBeenCalledWith(3);
    expect(mocks.engineInstances.length).toBe(1);
    // Join announces state over the attached socket.
    expect(sent.some((m) => m.type === 'voice:state')).toBe(true);
    // CallBar is now visible with the session name (hidden while idle).
    await waitFor(() => expect(screen.getByRole('region', { name: /Active call: Build room/ })).toBeTruthy());
    // The other participant arrived via presence mapping (provider state +
    // engine peer list — CallBar shows avatars only, so assert the data).
    const ids = captured.participants.map((p: any) => p.memberId).sort();
    expect(ids).toEqual([1, 2]);
    expect(mocks.engineInstances[0].peers.sort()).toEqual([1, 2]);

    // leave(): the exact call App makes on team switch / logout.
    await act(async () => {
      await captured.leave();
    });
    expect(sent.some((m) => m.type === 'voice:leave')).toBe(true);
    expect(mocks.voiceApi.leave).toHaveBeenCalled();
    expect(mocks.engineInstances[0].disposed).toBe(true);
    await waitFor(() => expect(screen.queryByRole('region', { name: /Active call/ })).toBeNull());
  });

  it('detachSocket stops engine sends (ws.onclose path)', async () => {
    const sent: any[] = [];
    renderHarness();
    act(() => {
      captured.attachSocket((m: any) => sent.push(m));
    });
    act(() => {
      captured.detachSocket();
    });
    await act(async () => {
      await captured.leave();
    });
    // leave() still runs (REST), but nothing goes over the dead socket.
    expect(mocks.voiceApi.leave).not.toHaveBeenCalled(); // no session was joined
    expect(sent.length).toBe(0);
  });
});
