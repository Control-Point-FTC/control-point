import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { makeVoiceMock, setVoiceMock } from '../../components/voice/__tests__/helpers';

const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));
const admin = vi.hoisted(() => ({ patchChannel: vi.fn(async () => ({})) }));
vi.mock('../../voice', () => ({ useVoice: () => (globalThis as any).__voiceMock }));
vi.mock('../../voice/api', () => ({ voiceAdminApi: admin }));
const cam = vi.hoisted(() => ({ value: 'ask' as 'ask' | 'on' | 'off' }));
vi.mock('../../components/SettingsModal', () => ({ getCameraDefault: () => cam.value }));

import { VoiceChannels } from '../pages/messages/VoiceChannels';

const channels = [
  { id: 3, name: 'Build room', participantCount: 1, participants: [{ memberId: 2, name: 'Ash', avatarUrl: null, isMuted: true, isDeafened: false, cameraOn: false, sharingScreen: false }], locked: false, isPrivate: false, isTemporary: false },
  { id: 4, name: 'Drive team', participantCount: 0, participants: [], locked: true, isPrivate: false, isTemporary: false },
];

beforeEach(() => { dialog.confirmDialog.mockReset(); admin.patchChannel.mockClear(); cam.value = 'ask'; });
afterEach(cleanup);

describe('Modern voice channels', () => {
  it('lists channels, auto-shows who is in a live one, and marks locks', () => {
    setVoiceMock(makeVoiceMock({ channels }));
    render(<VoiceChannels />);
    expect(screen.getByRole('button', { name: 'Join voice channel Build room' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Participants in Build room' })).toHaveTextContent('Ash');
    expect(screen.getByLabelText('Locked')).toBeInTheDocument();
  });

  it('asks about video per the camera default, then joins', async () => {
    const v = makeVoiceMock({ channels });
    setVoiceMock(v);
    dialog.confirmDialog.mockResolvedValueOnce(false);
    render(<VoiceChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Join voice channel Drive team' }));
    await waitFor(() => expect(v.joinChannel).toHaveBeenCalledWith(4, undefined));
    expect(dialog.confirmDialog).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join Build room with video on' }));
    await waitFor(() => expect(v.joinChannel).toHaveBeenCalledWith(3, { video: true }));
  });

  it('voice admins rename a channel', async () => {
    const v = makeVoiceMock({ channels, canManageVoice: true });
    setVoiceMock(v);
    render(<VoiceChannels />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename voice channel Drive team' }));
    fireEvent.change(screen.getByLabelText('Voice channel name'), { target: { value: 'Drivers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save voice channel name' }));
    await waitFor(() => expect(admin.patchChannel).toHaveBeenCalledWith(4, { name: 'Drivers' }));
    expect(v.refreshChannels).toHaveBeenCalled();
  });
});
