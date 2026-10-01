// CallBar state tests: hidden when idle, name + status pill + count when
// connected, reconnecting/failed pills, leave + expand wiring.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CallBar } from '../CallBar';
import { makeVoiceMock, setVoiceMock } from './helpers';

// NOTE: vi.hoisted factories run before imports initialize, so the mock
// bundle is defined inline here rather than imported from helpers.
const mocks = vi.hoisted(() => ({
  voiceApi: {
    getSettings: vi.fn(async () => ({})),
    putSettings: vi.fn(async (b: any) => b),
  },
  voiceAdminApi: {
    createChannel: vi.fn(async () => ({})),
    patchChannel: vi.fn(async () => ({})),
    deleteChannel: vi.fn(async () => {}),
    reorderChannels: vi.fn(async () => {}),
    getRolePerms: vi.fn(async () => []),
    putRolePerms: vi.fn(async () => []),
  },
  media: {
    getMicStream: vi.fn(),
    getCameraStream: vi.fn(),
    queryPermission: vi.fn(async () => 'unknown'),
    stopStream: vi.fn(),
  },
  confirmDialog: vi.fn(async () => true),
  notify: vi.fn(),
}));

vi.mock('../../../voice', () => ({
  useVoice: () => (globalThis as any).__voiceMock,
  voiceApi: mocks.voiceApi,
  voiceAdminApi: mocks.voiceAdminApi,
  getMicStream: mocks.media.getMicStream,
  getCameraStream: mocks.media.getCameraStream,
  queryPermission: mocks.media.queryPermission,
  stopStream: mocks.media.stopStream,
}));

const session = {
  id: 7,
  kind: 'voice_channel',
  channelId: 3,
  name: 'Build room',
  locked: false,
  globalSpotlightMemberId: null,
};

const participants = [
  { memberId: 1, name: 'You', avatarUrl: null, isMuted: false, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: false, connectionQuality: 'good', isSelf: true },
  { memberId: 2, name: 'Ash', avatarUrl: null, isMuted: true, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: true, connectionQuality: 'good', isSelf: false },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('CallBar', () => {
  it('renders nothing when idle', () => {
    setVoiceMock(makeVoiceMock({ status: 'idle', session: null }));
    const { container } = render(<CallBar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the channel name, connected pill, and participant count', () => {
    setVoiceMock(makeVoiceMock({ status: 'connected', session, participants }));
    render(<CallBar />);
    expect(screen.getByText('Build room')).toBeTruthy();
    expect(screen.getByLabelText('Call status: Connected')).toBeTruthy();
    expect(screen.getByLabelText('2 participants')).toBeTruthy();
  });

  it('shows reconnecting and failed states', () => {
    setVoiceMock(makeVoiceMock({ status: 'reconnecting', session, participants }));
    const { rerender } = render(<CallBar />);
    expect(screen.getByLabelText('Call status: Reconnecting')).toBeTruthy();

    setVoiceMock(makeVoiceMock({ status: 'failed', session, participants }));
    rerender(<CallBar />);
    expect(screen.getByLabelText('Call status: Connection failed')).toBeTruthy();
  });

  it('leave button calls leave()', () => {
    const leave = vi.fn(async () => {});
    setVoiceMock(makeVoiceMock({ status: 'connected', session, participants, leave }));
    render(<CallBar />);
    fireEvent.click(screen.getByLabelText('Leave call'));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('expand button calls setExpanded(true)', () => {
    const setExpanded = vi.fn();
    setVoiceMock(makeVoiceMock({ status: 'connected', session, participants, setExpanded }));
    render(<CallBar />);
    fireEvent.click(screen.getByLabelText('Expand call view'));
    expect(setExpanded).toHaveBeenCalledWith(true);
  });

  it('mute toggle reflects and toggles self state', () => {
    const toggleMute = vi.fn();
    const voice = makeVoiceMock({
      status: 'connected',
      session,
      participants,
      toggleMute,
      self: { muted: true, deafened: false, cameraOn: false, sharingScreen: false, micLevel: 0 },
    });
    setVoiceMock(voice);
    render(<CallBar />);
    fireEvent.click(screen.getByLabelText('Unmute'));
    expect(toggleMute).toHaveBeenCalledTimes(1);
  });
});
