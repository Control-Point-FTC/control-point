import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import { makeVoiceMock, setVoiceMock } from '../../components/voice/__tests__/helpers';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));
vi.mock('../../voice', () => ({
  useVoice: () => (globalThis as any).__voiceMock,
  voiceApi: { getSettings: vi.fn(async () => ({})), putSettings: vi.fn(async (b: any) => b) },
  voiceAdminApi: {},
}));
vi.mock('../../utils/sounds', () => ({ startRingtone: vi.fn(), stopRingtone: vi.fn(), playNotificationSound: vi.fn() }));

import { CookieBar, FeedbackDialog, InstallBanner, MentionToastCard } from '../overlays/Overlays';
import { CallDock, CallStage, IncomingCall } from '../overlays/CallUi';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
// jsdom's File and Node's FormData don't mix; a plain recorder is enough here.
class FakeFormData { private m = new Map<string, any>(); append(k: string, v: any) { this.m.set(k, v); } get(k: string) { return this.m.get(k) ?? null; } }
globalThis.FormData = FakeFormData as any;
globalThis.URL.createObjectURL = (() => 'blob:x') as any;
globalThis.URL.revokeObjectURL = (() => {}) as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });

beforeEach(() => {
  localStorage.clear();
  clearDrafts();
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({}));
  dialog.notify.mockReset();
});
afterEach(cleanup);

describe('Modern storage consent', () => {
  it('Essential only saves the choice and hides; the settings event reopens it customized', async () => {
    render(<CookieBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Essential only' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Storage preferences' })).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('cp-consent')!)).toMatchObject({ necessary: true, functional: false });
    act(() => { window.dispatchEvent(new Event('cp:cookie-settings')); });
    const sw = await screen.findByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole('button', { name: 'Save my choice' }));
    expect(JSON.parse(localStorage.getItem('cp-consent')!)).toMatchObject({ functional: true });
  });
});

describe('Modern feedback', () => {
  it('sends the same form as Classic and keeps a half-written note across a remount', async () => {
    const first = render(<FeedbackDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Calendar is slow' } });
    first.unmount();
    render(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByLabelText('Message')).toHaveValue('Calendar is slow');
    const file = new File(['png'], 'shot.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Attach a file'), { target: { files: [file] } });
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Sushil' }));
    await waitFor(() => expect(screen.getByText('Feedback sent')).toBeInTheDocument());
    const body = api.apiFetch.mock.calls[0][1].body as unknown as FakeFormData;
    expect(api.apiFetch.mock.calls[0][0]).toBe('/api/feedback');
    expect(body.get('category')).toBe('general');
    expect(body.get('message')).toBe('Calendar is slow');
    expect((body.get('attachment') as File).name).toBe('shot.png');
  });

  it('rejects unsupported files', () => {
    render(<FeedbackDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Attach a file'), { target: { files: [new File(['x'], 'tool.exe')] } });
    expect(dialog.notify).toHaveBeenCalledWith(expect.stringMatching(/not supported/), 'error');
  });
});

describe('Modern install prompt', () => {
  it('appears on Android when the browser offers install, and installs', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
    Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    render(<InstallBanner />);
    const prompt = vi.fn(async () => {});
    const evt = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    act(() => { window.dispatchEvent(evt); });
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Install the app' })).not.toBeInTheDocument());
    ua.mockRestore();
  });
});

describe('Modern mention toast', () => {
  it('jumps or dismisses', () => {
    const onJump = vi.fn(); const onDismiss = vi.fn();
    render(<MentionToastCard toast={{ content: '@Ada can you check the lift?' }} channelName="build" canJump onJump={onJump} onDismiss={onDismiss} />);
    expect(screen.getByText('Mentioned in #build')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to #build' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onJump).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});

const session = { id: 7, kind: 'voice_channel', channelId: 3, name: 'Build room', locked: false, globalSpotlightMemberId: null };
const participants = [
  { memberId: 1, name: 'You', avatarUrl: null, isMuted: false, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: false, connectionQuality: 'good', isSelf: true },
  { memberId: 2, name: 'Ash', avatarUrl: null, isMuted: true, isDeafened: false, cameraOn: false, sharingScreen: false, speaking: true, connectionQuality: 'good', isSelf: false },
];

describe('Modern call UI', () => {
  it('dock: shows the call and its controls work', () => {
    const v = makeVoiceMock({ status: 'connected', session, participants });
    setVoiceMock(v);
    render(<CallDock />);
    expect(screen.getByRole('region', { name: 'Active call: Build room' })).toHaveTextContent('Connected');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Expand call view' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Leave call' }));
    expect(v.toggleMute).toHaveBeenCalled();
    expect(v.setExpanded).toHaveBeenCalledWith(true);
    expect(v.leave).toHaveBeenCalled();
  });

  it('dock: hidden when not in a call', () => {
    setVoiceMock(makeVoiceMock());
    const { container } = render(<CallDock />);
    expect(container.firstChild).toBeNull();
  });

  it('incoming: accept, decline and the explicit switch when already in a call', async () => {
    const incomingCall = { inviteId: 11, sessionId: 22, kind: 'dm', media: 'video', inviter: { id: 2, name: 'Ash' } };
    let v = makeVoiceMock({ incomingCall });
    setVoiceMock(v);
    const r = render(<IncomingCall />);
    expect(screen.getByText('Incoming video call')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }));
    await waitFor(() => expect(v.acceptCall).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Decline/ }));
    await waitFor(() => expect(v.declineCall).toHaveBeenCalled());
    r.unmount();
    v = makeVoiceMock({ incomingCall, session, status: 'connected' });
    setVoiceMock(v);
    render(<IncomingCall />);
    expect(screen.getByRole('alert')).toHaveTextContent('already in “Build room”');
    fireEvent.click(screen.getByRole('button', { name: 'Leave & join' }));
    await waitFor(() => expect(v.acceptCall).toHaveBeenCalled());
    expect(v.leave).toHaveBeenCalled();
  });

  it('stage: tiles, the People sheet and the dock', async () => {
    const v = makeVoiceMock({ status: 'connected', session, participants, expanded: true });
    setVoiceMock(v);
    render(<CallStage />);
    expect(screen.getByRole('region', { name: 'Call view: Build room' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ash, muted/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // People list starts closed
    fireEvent.click(screen.getByRole('button', { name: /People/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('People · 2')).toBeInTheDocument();
    expect(within(sheet).getByText('Speaking')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Minimize call view', hidden: true }));
    expect(v.setExpanded).toHaveBeenCalledWith(false);
  });

  it('stage: a screen share takes the stage', () => {
    const sharing = participants.map((p) => (p.memberId === 2 ? { ...p, sharingScreen: true } : p));
    setVoiceMock(makeVoiceMock({ status: 'connected', session, participants: sharing, expanded: true }));
    render(<CallStage />);
    expect(screen.getByText("Ash's screen")).toBeInTheDocument();
    expect(screen.getByText('Waiting for Ash’s screen…'.replace('’', "'"))).toBeInTheDocument();
  });
});

describe('9f review fixes', () => {
  it('the stage keeps the camera button on phones; settings minimizes the call first', () => {
    const v = makeVoiceMock({ status: 'connected', session, participants, expanded: true });
    setVoiceMock(v);
    const onOpenSettings = vi.fn();
    render(<CallStage onOpenSettings={onOpenSettings} />);
    expect(screen.getByRole('button', { name: 'Turn camera on' }).className).not.toMatch(/max-sm:hidden/);
    fireEvent.click(screen.getByRole('button', { name: 'Call settings' }));
    expect(v.setExpanded).toHaveBeenCalledWith(false);
    expect(onOpenSettings).toHaveBeenCalled();
    cleanup();
    render(<CallDock />);
    expect(screen.getByRole('button', { name: 'Turn camera on' }).className).toMatch(/max-sm:hidden/);
  });

  it('choosing someone in People closes the sheet and opens their options; People leaves fullscreen first', async () => {
    setVoiceMock(makeVoiceMock({ status: 'connected', session, participants, expanded: true }));
    const exit = vi.fn(async () => {});
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.body });
    (document as any).exitFullscreen = exit;
    render(<CallStage />);
    fireEvent.click(screen.getByRole('button', { name: /People/ }));
    await waitFor(() => expect(exit).toHaveBeenCalled());
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ash options' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('menu', { name: 'Options for Ash' })).toBeInTheDocument();
  });

  it('a feedback send that lands after reopening keeps the newer note, and the lock survives the reopen', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation(() => new Promise((r) => { finish = () => r({ ok: true, status: 200, json: async () => ({}) }); }));
    const first = render(<FeedbackDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'first note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Sushil' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<FeedbackDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'second note' } });
    await act(async () => { finish(); });
    expect(screen.getByLabelText('Message')).toHaveValue('second note');
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('a look switch keeps an install offer the browser already made', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
    Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
    const first = render(<InstallBanner />);
    const prompt = vi.fn(async () => {});
    act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })); });
    await screen.findByRole('button', { name: 'Install' });
    first.unmount();
    render(<InstallBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    ua.mockRestore();
  });
});

