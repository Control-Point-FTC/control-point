// IncomingCallModal tests: caller info + media badge, Accept / Decline /
// Dismiss wiring, and the explicit stay-vs-switch flow when already in a call.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { IncomingCallModal } from '../IncomingCallModal';
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

const incomingCall = {
  inviteId: 11,
  sessionId: 22,
  kind: 'dm',
  media: 'audio',
  inviter: { id: 2, name: 'Ash' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('IncomingCallModal', () => {
  it('renders nothing without an incoming call', () => {
    setVoiceMock(makeVoiceMock({ incomingCall: null }));
    const { container } = render(<IncomingCallModal />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the caller name and audio badge', () => {
    setVoiceMock(makeVoiceMock({ incomingCall }));
    render(<IncomingCallModal />);
    expect(screen.getByText('Ash')).toBeTruthy();
    expect(screen.getByText('Incoming voice call')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Accept/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Decline/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dismiss/ })).toBeTruthy();
  });

  it('shows the video badge for video invites', () => {
    setVoiceMock(makeVoiceMock({ incomingCall: { ...incomingCall, media: 'video' } }));
    render(<IncomingCallModal />);
    expect(screen.getByText('Incoming video call')).toBeTruthy();
  });

  it('Accept calls acceptCall()', () => {
    const acceptCall = vi.fn(async () => {});
    setVoiceMock(makeVoiceMock({ incomingCall, acceptCall }));
    render(<IncomingCallModal />);
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }));
    expect(acceptCall).toHaveBeenCalledTimes(1);
  });

  it('Decline calls declineCall()', () => {
    const declineCall = vi.fn(async () => {});
    setVoiceMock(makeVoiceMock({ incomingCall, declineCall }));
    render(<IncomingCallModal />);
    fireEvent.click(screen.getByRole('button', { name: /Decline/ }));
    expect(declineCall).toHaveBeenCalledTimes(1);
  });

  it('Dismiss hides without declining', () => {
    const dismissIncomingCall = vi.fn();
    const declineCall = vi.fn(async () => {});
    setVoiceMock(makeVoiceMock({ incomingCall, dismissIncomingCall, declineCall }));
    render(<IncomingCallModal />);
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(dismissIncomingCall).toHaveBeenCalledTimes(1);
    expect(declineCall).not.toHaveBeenCalled();
  });

  it('warns explicitly when already in another call', () => {
    setVoiceMock(
      makeVoiceMock({
        incomingCall,
        status: 'connected',
        session: { id: 7, kind: 'voice_channel', channelId: 3, name: 'Build room', locked: false, globalSpotlightMemberId: null },
      }),
    );
    render(<IncomingCallModal />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/already in/i)).toBeTruthy();
    expect(screen.getByText('Stay here')).toBeTruthy();
    expect(screen.getByText('Leave & join')).toBeTruthy();
    // No one-click accept path while in another call.
    expect(screen.queryByRole('button', { name: /^Accept$/ })).toBeNull();
  });

  it('"Leave & join" leaves the current call before accepting', async () => {
    const leave = vi.fn(async () => {});
    const acceptCall = vi.fn(async () => {});
    setVoiceMock(
      makeVoiceMock({
        incomingCall,
        status: 'connected',
        session: { id: 7, kind: 'voice_channel', channelId: 3, name: 'Build room', locked: false, globalSpotlightMemberId: null },
        leave,
        acceptCall,
      }),
    );
    render(<IncomingCallModal />);
    fireEvent.click(screen.getByText('Leave & join'));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(acceptCall).toHaveBeenCalledTimes(1));
    // leave() must happen before acceptCall().
    const leaveOrder = leave.mock.invocationCallOrder[0];
    const acceptOrder = acceptCall.mock.invocationCallOrder[0];
    expect(leaveOrder).toBeLessThan(acceptOrder);
  });
});
