import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { makeVoiceMock, setVoiceMock } from '../../components/voice/__tests__/helpers';

const media = vi.hoisted(() => ({
  getMicStream: vi.fn(), getCameraStream: vi.fn(), queryPermission: vi.fn(async () => 'prompt'),
  requestDevicePermissions: vi.fn(async () => ({ microphone: 'granted', camera: 'denied' })), stopStream: vi.fn(),
}));
vi.mock('../../voice', () => ({
  useVoice: () => (globalThis as any).__voiceMock,
  ...media,
  MediaError: class MediaError extends Error {},
}));

import { DeviceSettings } from '../pages/settings/DeviceSettings';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
// jsdom has no media playback; the preview calls video.play().
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
beforeEach(() => { Object.values(media).forEach((f) => (f as any).mockClear?.()); });
afterEach(cleanup);

const devices = {
  audioinputs: [{ deviceId: 'mic-1', label: 'USB Mic' }],
  videoinputs: [{ deviceId: 'cam-1', label: 'Webcam' }],
  audiooutputs: [],
};

describe('Modern device settings', () => {
  it('shows permission state and asks again on demand', async () => {
    setVoiceMock(makeVoiceMock({ devices }));
    render(<DeviceSettings />);
    expect(await screen.findAllByText('Not asked yet')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Enable microphone & camera/ }));
    await waitFor(() => expect(screen.getByText('Allowed')).toBeInTheDocument());
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('device choices, volume and processing go to the voice context', () => {
    const v = makeVoiceMock({ devices });
    setVoiceMock(v);
    render(<DeviceSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Noise suppression' }));
    expect(v.setDevicePrefs).toHaveBeenCalledWith({ noiseSuppression: false });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Input volume' }), { key: 'ArrowRight' });
    expect(v.setDevicePrefs).toHaveBeenCalledWith({ micVolume: 1.01 });
    expect(screen.getByRole('combobox', { name: 'Output device' })).toBeDisabled(); // no selectable outputs here
  });

  it('the camera preview acquires the camera only while open', async () => {
    const stream = { getTracks: () => [] } as any;
    media.getCameraStream.mockResolvedValue(stream);
    setVoiceMock(makeVoiceMock({ devices }));
    render(<DeviceSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Preview camera/ }));
    await waitFor(() => expect(media.getCameraStream).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: /Stop preview/ }));
    expect(media.stopStream).toHaveBeenCalledWith(stream);
  });

  it('devices listed with an empty id (before access) do not break the page', () => {
    setVoiceMock(makeVoiceMock({ devices: { audioinputs: [{ deviceId: '', label: '' }], videoinputs: [{ deviceId: '', label: '' }], audiooutputs: [] } }));
    render(<DeviceSettings />);
    expect(screen.getByRole('combobox', { name: 'Input device' })).toHaveTextContent('Default microphone');
  });

  it('leaving with the preview open releases the camera', async () => {
    const stream = { getTracks: () => [] } as any;
    media.getCameraStream.mockResolvedValue(stream);
    setVoiceMock(makeVoiceMock({ devices }));
    const r = render(<DeviceSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Preview camera/ }));
    await screen.findByRole('button', { name: /Stop preview/ });
    r.unmount();
    expect(media.stopStream).toHaveBeenCalledWith(stream);
  });

  it('a camera that finishes starting after you left is stopped at once', async () => {
    const stream = { getTracks: () => [] } as any;
    let give: (s: any) => void = () => {};
    media.getCameraStream.mockImplementation(() => new Promise((r) => { give = r; }));
    setVoiceMock(makeVoiceMock({ devices }));
    const r = render(<DeviceSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Preview camera/ }));
    await waitFor(() => expect(media.getCameraStream).toHaveBeenCalled());
    r.unmount();
    await act(async () => { give(stream); });
    expect(media.stopStream).toHaveBeenCalledWith(stream);
  });
});

