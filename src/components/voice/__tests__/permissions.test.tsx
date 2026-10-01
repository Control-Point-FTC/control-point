// Permission-gating tests:
// - VoiceChannelAdmin renders nothing without canManageVoice, and its UI with it.
// - ParticipantMenu hides moderator items without canModerate, shows them with
//   it, and routes destructive actions through confirmDialog.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { VoiceChannelAdmin } from '../VoiceChannelAdmin';
import { ParticipantMenu } from '../ParticipantMenu';
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

vi.mock('../../dialog', () => ({
  confirmDialog: mocks.confirmDialog,
  notify: mocks.notify,
}));

const confirmDialogMock: any = mocks.confirmDialog;

const channels = [
  { id: 1, name: 'Lobby', description: '', maxParticipants: 0, locked: false, isPrivate: false, sessionId: null, participantCount: 0, participants: [] },
];

const participant: any = {
  memberId: 2,
  name: 'Ash',
  avatarUrl: null,
  isMuted: false,
  isDeafened: false,
  cameraOn: false,
  sharingScreen: false,
  speaking: false,
  connectionQuality: 'good',
  isSelf: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => cleanup());

describe('VoiceChannelAdmin permission gating', () => {
  it('renders nothing without canManageVoice', () => {
    setVoiceMock(makeVoiceMock({ canManageVoice: false, channels }));
    const { container } = render(<VoiceChannelAdmin />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the admin UI with canManageVoice', () => {
    setVoiceMock(makeVoiceMock({ canManageVoice: true, channels }));
    render(<VoiceChannelAdmin />);
    expect(screen.getByLabelText('Voice channel administration')).toBeTruthy();
    expect(screen.getByText('Lobby')).toBeTruthy();
    expect(screen.getByText('New channel')).toBeTruthy();
  });

  it('does not fetch roles without canManageVoice', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no server'));
    try {
      setVoiceMock(makeVoiceMock({ canManageVoice: false, channels }));
      render(<VoiceChannelAdmin />);
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('ParticipantMenu permission gating', () => {
  const renderMenu = (voice: any) => {
    setVoiceMock(voice);
    return render(
      <ParticipantMenu participant={participant} anchor={{ x: 100, y: 100 }} onClose={() => {}} />,
    );
  };

  it('shows personal items without canModerate, hides moderator items', () => {
    renderMenu(makeVoiceMock({ canModerate: false, session: null }));
    expect(screen.getByRole('menuitem', { name: /Pin for me/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Spotlight for me/ })).toBeTruthy();
    expect(screen.getByLabelText('Their volume')).toBeTruthy();
    expect(screen.queryByText('Moderate')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mute' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Remove from call' })).toBeNull();
  });

  it('shows moderator items with canModerate', () => {
    renderMenu(makeVoiceMock({ canModerate: true, channels, session: null }));
    expect(screen.getByText('Moderate')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mute' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Deafen' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Set global spotlight' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Remove from call' })).toBeTruthy();
  });

  it('routes "Remove from call" through confirmDialog before moderating', async () => {
    const moderate = vi.fn(async () => {});
    renderMenu(makeVoiceMock({ canModerate: true, channels, session: null, moderate }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from call' }));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    const opts = confirmDialogMock.mock.calls[0]?.[0] as any;
    expect(opts.danger).toBe(true);
    expect(String(opts.message)).toMatch(/kicked/i);
    await waitFor(() => expect(moderate).toHaveBeenCalledWith('remove', 2));
  });

  it('does not moderate when the confirm is cancelled', async () => {
    confirmDialogMock.mockResolvedValueOnce(false);
    const moderate = vi.fn(async () => {});
    renderMenu(makeVoiceMock({ canModerate: true, channels, session: null, moderate }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from call' }));
    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(moderate).not.toHaveBeenCalled();
  });

  it('volume slider persists per-participant volume', () => {
    renderMenu(makeVoiceMock({ canModerate: false, session: null }));
    const slider = screen.getByLabelText('Their volume') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '40' } });
    const stored = JSON.parse(localStorage.getItem('cp-voice-volumes') || '{}');
    expect(stored['2']).toBeCloseTo(0.4);
  });
});
