import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const voice = vi.hoisted(() => ({ getSettings: vi.fn(), putSettings: vi.fn() }));
vi.mock('../../voice', () => ({ voiceApi: voice }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { CallsPolicy } from '../pages/settings/CallsPolicy';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const SETTINGS = {
  video_enabled: 1, screenshare_enabled: 1, global_spotlight_enabled: 0, dm_calls_allowed: 1, group_calls_allowed: 0,
  default_max_participants: 12, default_video_quality: 'medium', default_audio_quality: 'high', call_timeout_minutes: 0, reconnect_attempts: 5,
};

beforeEach(() => {
  voice.getSettings.mockReset();
  voice.getSettings.mockResolvedValue({ ...SETTINGS });
  voice.putSettings.mockReset();
  voice.putSettings.mockImplementation(async (b: any) => b);
  dialog.notify.mockReset();
});
afterEach(cleanup);
const mount = () => render(<MemoryRouter><CallsPolicy /></MemoryRouter>);

describe('Modern calls policy', () => {
  it('saves the same clamped body as Classic, and Save only shows when something changed', async () => {
    mount();
    const screenshare = await screen.findByRole('switch', { name: 'Screen sharing' });
    expect(screen.queryByRole('button', { name: /Save calls policy/ })).not.toBeInTheDocument();
    fireEvent.click(screenshare);
    fireEvent.change(screen.getByLabelText('Reconnect attempts'), { target: { value: '99' } });
    fireEvent.click(await screen.findByRole('button', { name: /Save calls policy/ }));
    await waitFor(() => expect(voice.putSettings).toHaveBeenCalled());
    expect(voice.putSettings.mock.calls[0][0]).toEqual({
      video_enabled: true, screenshare_enabled: false, global_spotlight_enabled: false, dm_calls_allowed: true, group_calls_allowed: false,
      default_max_participants: 12, default_video_quality: 'medium', default_audio_quality: 'high', call_timeout_minutes: 0, reconnect_attempts: 20,
    });
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Voice settings saved.', 'success'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save calls policy/ })).not.toBeInTheDocument());
  });

  it('an edit made while saving is kept (and stays unsaved)', async () => {
    let finish: (v: any) => void = () => {};
    voice.putSettings.mockImplementation((b: any) => new Promise((r) => { finish = () => r(b); }));
    mount();
    fireEvent.click(await screen.findByRole('switch', { name: 'Global spotlight' }));
    fireEvent.click(await screen.findByRole('button', { name: /Save calls policy/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Member calls' }));
    await act(async () => { finish(undefined); });
    expect(screen.getByRole('switch', { name: 'Member calls' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('says so when the policy cannot load', async () => {
    voice.getSettings.mockRejectedValue(new Error('x'));
    mount();
    expect(await screen.findByText('Could not load the calls policy.')).toBeInTheDocument();
  });
});
