import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import i18n from '../../i18n';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));
vi.mock('../../components/voice/DeviceSettingsSection', () => ({ DeviceSettingsSection: () => <div>device-panel</div> }));
vi.mock('../../components/voice/VoiceSettingsSection', () => ({ VoiceSettingsSection: () => <div>voice-policy</div> }));

import { InterfaceModeProvider } from '../interfaceMode';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {};

const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string) => {
    if (url === '/api/calendar/link') return json({ linked: false });
    if (url === '/api/messages') return json([{ id: 5, content: 'hello', sender_name: 'Grace', timestamp: '2026-01-01T00:00:00Z' }]);
    if (url === '/api/admin/storage-usage') return json({ totalSize: 2048 });
    if (url === '/api/profile') return json({ user: { id: 7, name: 'Ada L', role: 'Lead' } });
    if (url.startsWith('/api/ftc/lookup')) return json({ number: 4215, name: 'Hypnotic', schoolName: 'HS', location: { city: 'X', state: 'NJ' } });
    if (url === '/api/teams/regenerate-code') return json({ access_code: 'NEW-1' });
    return json({});
  });
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
  localStorage.clear();
});

const me = { id: 7, name: 'Ada', role: 'Builder', email: 'ada@x.test', team_id: 1, interface_mode: 'modern', hasPassword: true, presence_status: 'online', scopes: '["tasks"]', is_board: 1 };
const team = { id: 1, name: 'Robo', number: '123', ftc_team_number: 123, access_code: 'JOIN-42' };

function setup({ section = 'profile', admin = true, owner = false, teams = [team] as any[], user = me as any } = {}) {
  const props = {
    currentUser: user, teams, isAdmin: admin, isOwner: owner, hasPerm: (p: string) => admin && p !== 'manage_voice',
    settings: { excuse_criteria: 'old rules' }, refresh: { members: vi.fn(), settings: vi.fn() },
    onUserSaved: vi.fn(), onTeamSaved: vi.fn(), onStatusPick: vi.fn(), setColorVersion: vi.fn(),
  };
  const utils = render(
    <InterfaceModeProvider user={user} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={[`/settings?section=${section}`]}><SettingsPage {...props} /></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props };
}
const bodyOf = (url: string, method?: string) => JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === url && (!method || c[1]?.method === method))![1].body);

describe('Modern Settings — profile', () => {
  it('saves name/title/accent with the /profile PATCH body; the draft survives a remount', async () => {
    const first = setup();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada L' } });
    fireEvent.change(screen.getByLabelText('Personal accent'), { target: { value: '#22c55e' } });
    first.unmount();
    const { props } = setup();
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ada L');
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(props.onUserSaved).toHaveBeenCalled());
    expect(bodyOf('/api/profile', 'PATCH')).toEqual({ name: 'Ada L', role: 'Builder', accent_color: '#22c55e' });
  });

  it('validates the name and picks a status', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  ' } });
    expect(screen.getByRole('alert')).toHaveTextContent("Name can't be empty.");
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Do Not Disturb/ }));
    expect(props.onStatusPick).toHaveBeenCalledWith('dnd');
  });
});

describe('Modern Settings — account', () => {
  it('changes the password with the same request and checks the confirmation', async () => {
    setup({ section: 'account' });
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('New passwords do not match.');
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
    await waitFor(() => expect(bodyOf('/api/auth/change-password')).toEqual({ currentPassword: 'old-pass', newPassword: 'new-pass-1' }));
  });

  it('only lets you delete the account after leaving every workspace', () => {
    setup({ section: 'account' });
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
    cleanup();
    setup({ section: 'account', teams: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByRole('button', { name: /Delete forever/ })).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText('Confirm your email'), { target: { value: 'ADA@x.test' } });
    expect(within(dlg).getByRole('button', { name: /Delete forever/ })).not.toBeDisabled();
  });
});

describe('Modern Settings — Bruno', () => {
  it('saves teaching mode on the member row and answer style on this device', async () => {
    const { props } = setup({ section: 'bruno' });
    fireEvent.click(screen.getByRole('switch', { name: 'Teaching mode' }));
    await waitFor(() => expect(props.onUserSaved).toHaveBeenCalled());
    expect(bodyOf('/api/profile', 'PATCH')).toEqual({ name: 'Ada', role: 'Builder', bruno_teach_mode: 1 });
    fireEvent.click(screen.getByRole('radio', { name: 'Technical' }));
    expect(localStorage.getItem('controlpoint-bruno-explanation-style')).toBe('technical');
  });
});

describe('Modern Settings — workspace & admin', () => {
  it('admins verify and save the FTC team with the Legacy body; invite code regenerates after a second click', async () => {
    const { props } = setup({ section: 'workspace' });
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '4215' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('#4215 Hypnotic')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onTeamSaved).toHaveBeenCalled());
    expect(bodyOf('/api/teams/1', 'PATCH')).toEqual({ name: 'Robo', ftc_team_number: 4215, number: '4215' });
    fireEvent.click(screen.getByRole('button', { name: /Generate new code/ }));
    expect(api.apiFetch).not.toHaveBeenCalledWith('/api/teams/regenerate-code', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Yes, replace it/ }));
    await waitFor(() => expect(props.onTeamSaved).toHaveBeenCalledWith({ id: 1, access_code: 'NEW-1' }));
  });

  it('members see the team read-only and no admin section', () => {
    setup({ section: 'workspace', admin: false });
    expect(screen.getByLabelText('Workspace name')).toBeDisabled();
    expect(screen.queryByText('Invite code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Admin/ })).not.toBeInTheDocument();
  });

  it('admin: criteria are drafted and saved; AI limits only for the app owner; messages can be removed', async () => {
    const first = setup({ section: 'admin' });
    expect(screen.queryByText('AI configuration')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Absence criteria'), { target: { value: 'new rules' } });
    first.unmount();
    setup({ section: 'admin', owner: true });
    expect((screen.getByLabelText('Absence criteria') as HTMLTextAreaElement).value).toBe('new rules');
    expect(screen.getByText('AI configuration')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    await waitFor(() => expect(bodyOf('/api/settings')).toEqual({ key: 'excuse_criteria', value: 'new rules' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete message' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/messages/5?silent=true', { method: 'DELETE' }));
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });
});

describe('Modern Settings — review regressions', () => {
  it('a profile save that finishes late never wipes newer edits', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation((url: string) => (url === '/api/profile'
      ? new Promise((res) => { finish = () => res({ ok: true, json: async () => ({ user: { id: 7, name: 'Ada L' } }) }); })
      : json({})));
    setup();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada L' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Captain' } });
    await act(async () => { finish(); });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Captain');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('"Use team default" previews the team colour', () => {
    const user = { ...me, accent_color: '#ff0000' };
    setup({ user, teams: [{ ...team, accent_color: '#00ff00' }] });
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#ff0000');
    fireEvent.click(screen.getByRole('button', { name: /Use team default/ }));
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#00ff00');
  });

  it('locks answer length while a save is in flight', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation((url: string) => (url === '/api/profile'
      ? new Promise((res) => { finish = () => res({ ok: true, json: async () => ({ user: me }) }); })
      : json({})));
    setup({ section: 'bruno' });
    fireEvent.click(screen.getByRole('radio', { name: 'Long' }));
    expect(screen.getByRole('radio', { name: 'Short' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Short' }));
    expect(api.apiFetch.mock.calls.filter((c) => c[0] === '/api/profile')).toHaveLength(1);
    await act(async () => { finish(); });
    expect(screen.getByRole('radio', { name: 'Short' })).not.toBeDisabled();
  });

  it('section names follow the chosen language', async () => {
    await act(async () => { await i18n.changeLanguage('es'); });
    try {
      setup();
      expect(screen.getByRole('button', { name: 'Cuenta y privacidad' })).toBeInTheDocument();
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});

