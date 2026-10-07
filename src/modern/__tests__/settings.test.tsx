import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import i18n from '../../i18n';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));
vi.mock('../../components/voice/DeviceSettingsSection', () => ({ DeviceSettingsSection: () => <div>device-panel</div> }));
vi.mock('../../voice/VoiceContext', () => ({ useVoice: () => ({ startCall: vi.fn() }) }));
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
    // The new code shows revealed to the admin who made it.
    expect(await screen.findByText('NEW-1')).toBeInTheDocument();
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

  it('is English-only: no language picker', async () => {
    setup({ section: 'appearance' });
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument();
    expect(i18n.language).toBe('en');
  });

  it('theme reset keeps unsaved name/title edits', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/theme/reset' ? json({ ok: true }) : json({})));
    setup();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset theme' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/theme/reset', expect.anything()));
    await waitFor(() => expect((screen.getByLabelText('Personal accent') as HTMLInputElement).value).toBe(''));
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ada Lovelace');
  });

  it('teaching mode stays locked while its own save runs, even if answer length saves meanwhile', async () => {
    const pending: (() => void)[] = [];
    api.apiFetch.mockImplementation((url: string) => (url === '/api/profile'
      ? new Promise((res) => { pending.push(() => res({ ok: true, json: async () => ({ user: me }) })); })
      : json({})));
    setup({ section: 'bruno' });
    fireEvent.click(screen.getByRole('switch', { name: 'Teaching mode' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Long' }));
    await act(async () => { pending[1](); });
    expect(screen.getByRole('switch', { name: 'Teaching mode' })).toBeDisabled();
    await act(async () => { pending[0](); });
    expect(screen.getByRole('switch', { name: 'Teaching mode' })).not.toBeDisabled();
  });
});


describe('Modern Settings — Discord-style workspace settings', () => {
  const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
  function at(url: string, { admin = true, perms = [] as string[] } = {}) {
    const props = {
      currentUser: me, teams: [team], members: [me], isAdmin: admin, isOwner: false, activeTeamName: 'Robo',
      hasPerm: (p: string) => (admin ? p !== 'manage_voice' : perms.includes(p)), hasScope: (s: string) => s === 'admin' && admin,
      settings: {}, refresh: { members: vi.fn(), settings: vi.fn() }, onRefresh: vi.fn(),
      onUserSaved: vi.fn(), onTeamSaved: vi.fn(), onStatusPick: vi.fn(), setColorVersion: vi.fn(),
    };
    return render(
      <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
        <MemoryRouter initialEntries={['/tasks', url]} initialIndex={1}>
          <Routes><Route path="*" element={<><SettingsPage {...props} /><Where /></>} /></Routes>
        </MemoryRouter>
      </InterfaceModeProvider>,
    );
  }
  const nav = () => within(screen.getByRole('navigation', { name: /sections/i }));

  it('groups User settings and the workspace’s settings; admins get Members and Roles', () => {
    at('/settings?section=workspace');
    expect(screen.getByText('User settings')).toBeInTheDocument();
    // Like Discord, the workspace's own name heads its settings.
    expect(screen.getByText('Robo', { selector: 'p' })).toBeInTheDocument();
    for (const name of ['Overview', 'Members', 'Roles', 'Admin']) expect(nav().getByRole('button', { name })).toBeInTheDocument();
  });

  it('members see neither; someone who can only invite gets Members but not Roles', () => {
    at('/settings?section=roles', { admin: false });
    expect(nav().queryByRole('button', { name: 'Members' })).not.toBeInTheDocument();
    expect(nav().queryByRole('button', { name: 'Roles' })).not.toBeInTheDocument();
    // An unknown/forbidden section falls back to Profile.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Profile');
    cleanup();
    at('/settings?section=members', { admin: false, perms: ['invite_members'] });
    expect(nav().getByRole('button', { name: 'Members' })).toBeInTheDocument();
    expect(nav().queryByRole('button', { name: 'Roles' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invite people/ })).toBeInTheDocument();
  });

  it('Roles lists the workspace roles with New role', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/roles'
      ? json([{ id: 2, name: 'Build Lead', color: '#3B82F6', permissions: [], is_system: 0, member_count: 0, position: 1, team_id: 1 }])
      : json({})));
    at('/settings?section=roles');
    expect(await screen.findByText('Build Lead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New role/ })).toBeInTheDocument();
  });

  it('?invite=1 opens the invite dialog; closing it clears the flag', async () => {
    at('/settings?section=members&invite=1');
    const dlg = await screen.findByRole('dialog');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('where').textContent).toBe('/settings?section=members');
  });

  it('links between sections replace history, so Esc still leaves Settings', async () => {
    at('/settings?section=workspace');
    fireEvent.click(screen.getByRole('button', { name: /Invite people/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('where').textContent).toBe('/tasks');
  });

  it('Overview → Open roles goes to the Roles section', () => {
    at('/settings?section=workspace');
    fireEvent.click(screen.getByRole('button', { name: /Open roles/ }));
    expect(screen.getByTestId('where').textContent).toBe('/settings?section=roles');
  });

  it('Esc leaves Settings, but not while typing', () => {
    at('/settings?section=profile');
    const input = screen.getAllByRole('textbox')[0];
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByTestId('where').textContent).toBe('/settings?section=profile');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('where').textContent).toBe('/tasks');
  });
});

describe('Modern Settings — notifications', () => {
  it('loads your choices and saves a change with one PATCH', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') return json({ team_updates: 'instant', everyone_pings: true });
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    setup({ section: 'notifications' });
    expect(await screen.findByRole('radio', { name: 'Digest' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: 'Instant' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/notification-prefs', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ team_updates: 'instant' }) })));
    expect(screen.getByText(/always reach you/)).toBeInTheDocument();
  });

  it('rolls back and says so when the save fails', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') return json({ error: 'Nope' }, false);
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    setup({ section: 'notifications' });
    fireEvent.click(await screen.findByRole('switch', { name: '@everyone and @here' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Nope', 'error'));
    expect(screen.getByRole('switch', { name: '@everyone and @here' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Modern Settings — notifications review regressions', () => {
  it('a failure goes back to what the server confirmed, not to another unsaved change', async () => {
    let calls = 0;
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') { calls++; return json({ error: 'Offline' }, false); }
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    setup({ section: 'notifications' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('switch', { name: '@everyone and @here' }));
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Digest' })).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('switch', { name: '@everyone and @here' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Modern Settings — notifications save order', () => {
  it('saves one at a time, so a slow first answer never undoes a later change', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body);
        order.push(Object.keys(body)[0]);
        if (body.team_updates) return new Promise((res) => { releaseFirst = () => res({ ok: true, json: async () => ({ team_updates: 'off', everyone_pings: true }) }); });
        return json({ team_updates: 'off', everyone_pings: false });
      }
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    setup({ section: 'notifications' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('switch', { name: '@everyone and @here' }));
    // The second save waits for the first.
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['team_updates']);
    await act(async () => { releaseFirst(); });
    await waitFor(() => expect(order).toEqual(['team_updates', 'everyone_pings']));
    await waitFor(() => expect(screen.getByRole('switch', { name: '@everyone and @here' })).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Modern Settings — notifications across reopen', () => {
  it('a save queued before closing runs before one made after reopening', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body);
        order.push(JSON.stringify(body));
        if (body.team_updates === 'off') return new Promise((res) => { releaseFirst = () => res({ ok: true, json: async () => ({ team_updates: 'off', everyone_pings: true }) }); });
        return json({ team_updates: 'off', everyone_pings: !!body.everyone_pings });
      }
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    const first = setup({ section: 'notifications' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Off' }));
    fireEvent.click(screen.getByRole('switch', { name: '@everyone and @here' })); // queued behind the slow one
    await waitFor(() => expect(order.length).toBe(1)); // the slow save is in flight
    first.unmount();
    setup({ section: 'notifications' });
    await act(async () => { releaseFirst(); });
    fireEvent.click(await screen.findByRole('switch', { name: '@everyone and @here' }));
    await waitFor(() => expect(order.length).toBe(3));
    expect(order).toEqual(['{"team_updates":"off"}', '{"everyone_pings":false}', expect.stringContaining('everyone_pings')]);
  });
});

describe('Modern Settings — notifications recover from a stalled request', () => {
  it('a stalled read is abandoned after the timeout, so reopening recovers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let first = true;
      api.apiFetch.mockImplementation((url: string, init?: any) => {
        if (url === '/api/notification-prefs' && !init?.method) {
          if (first) {
            first = false;
            return new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
          }
          return json({ team_updates: 'instant', everyone_pings: true });
        }
        return json({});
      });
      const a = setup({ section: 'notifications' });
      a.unmount();
      setup({ section: 'notifications' });
      await act(async () => { vi.advanceTimersByTime(15_000); });
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      expect(await screen.findByRole('radio', { name: 'Instant' })).toHaveAttribute('aria-checked', 'true');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Modern Settings — notifications body failures', () => {
  it('a save whose body never arrives keeps the confirmed choices and says so', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/notification-prefs' && init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) });
      }
      if (url === '/api/notification-prefs') return json({ team_updates: 'digest', everyone_pings: true });
      return json({});
    });
    setup({ section: 'notifications' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Off' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Saving took too long — try again.', 'error'));
    expect(screen.getByRole('radio', { name: 'Digest' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '@everyone and @here' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Modern Settings — access code history', () => {
  it('refreshes after a reveal, and a failed load says so instead of "nobody"', async () => {
    let events = 0;
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/calendar/link') return json({ linked: false });
      if (url === '/api/teams/1/access-code/reveal') return json({ access_code: 'JOIN-42' });
      if (url === '/api/teams/1/access-code/events') {
        events++;
        return events === 1 ? json({ error: 'down' }, false) : json([{ action: 'view', created_at: new Date().toISOString(), member_name: 'Ada' }]);
      }
      return json({});
    });
    setup({ section: 'workspace' });
    expect(await screen.findByText(/history couldn’t load/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal access code' }));
    expect(await screen.findByText('JOIN-42')).toBeInTheDocument();
    expect(await screen.findByText(/revealed the code/)).toBeInTheDocument();
  });
});

describe('Modern Settings — background grid', () => {
  it('everyone can shape the grid; it applies at once and resets', async () => {
    setup({ section: 'appearance', admin: false });
    fireEvent.click(screen.getByRole('radio', { name: 'Dots' }));
    expect(document.documentElement.classList.contains('cp-grid-dots')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Whole page' }));
    expect(document.documentElement.classList.contains('cp-grid-nofade')).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Cursor glow' }));
    expect(document.documentElement.classList.contains('cp-grid-glow')).toBe(true);
    expect(JSON.parse(localStorage.getItem('cp-grid-prefs') || '{}')).toMatchObject({ style: 'dots', fade: 'none', glow: true });
    fireEvent.click(screen.getByRole('button', { name: /Reset grid/ }));
    expect(document.documentElement.classList.contains('cp-grid-lines')).toBe(true);
    expect(document.documentElement.classList.contains('cp-grid-glow')).toBe(false);
  });

  it('only admins get the team colour control; nobody gets a personal colour picker', () => {
    setup({ section: 'appearance', admin: false });
    expect(screen.queryByRole('button', { name: /Team colour/ })).not.toBeInTheDocument();
    expect(screen.getByText(/set by your workspace admins/)).toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    cleanup();
    setup({ section: 'appearance', admin: true });
    expect(screen.getByRole('button', { name: /Team colour/ })).toBeInTheDocument();
  });

  it('turning the grid off disables its other controls', () => {
    setup({ section: 'appearance' });
    fireEvent.click(screen.getByRole('switch', { name: 'Show the grid' }));
    expect(document.documentElement.classList.contains('cp-grid-off')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Cursor glow' })).toBeDisabled();
  });
});
