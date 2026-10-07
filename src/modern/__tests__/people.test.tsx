import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const voice = vi.hoisted(() => ({ startCall: vi.fn() }));
vi.mock('../../voice/VoiceContext', () => ({ useVoice: () => voice }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { PeoplePage } from '../pages/people/PeoplePage';
import { MembersSection, RolesSection } from '../pages/settings/PeopleSections';
import { clearDrafts } from '../drafts';

const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const ROLES = [
  { id: 1, name: 'Admin', color: '#FFC700', permissions: ['*'], is_system: 1, member_count: 1, position: 0, team_id: 1 },
  { id: 2, name: 'Build Lead', color: '#3B82F6', permissions: ['view_ai'], is_system: 0, member_count: 0, position: 1, team_id: 1 },
];
function routeApi(url: string) {
  if (url === '/api/roles') return json(ROLES);
  if (url === '/api/role-permissions') return json([{ key: 'view_ai', label: 'Use Bruno' }, { key: 'manage_members', label: 'Manage members' }]);
  return json({});
}

// Radix Switch/Checkbox measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
// cmdk scrolls the active option into view.
Element.prototype.scrollIntoView ??= function () {};

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(routeApi);
  voice.startCall.mockReset();
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

const me = { id: 7, name: 'Ada', team_id: 1, email: 'ada@x.test', interface_mode: 'modern', presence: 'online', roles: [{ id: 1, name: 'Admin', color: '#FFC700' }] };
const grace = { id: 8, name: 'Grace', team_id: 1, email: 'grace@x.test', role: 'Builder', is_board: 0, scopes: '[]', presence: 'offline', roles: [] };
const teams = [{ id: 1, name: 'Robo', number: 123, access_code: 'JOIN42', member_count: 2 }, { id: 2, name: 'Other', number: 9, access_code: 'ZZZ', member_count: 3 }];

function setup({ admin = true, roles = true, url = '/teams', perms = [] as string[] } = {}) {
  const props = {
    members: [me, grace], teams, currentUser: me, refresh: { members: vi.fn() }, onRefresh: vi.fn(),
    hasScope: (s: string) => (s === 'admin' ? admin : false), hasPerm: (p: string) => (p === 'manage_roles' ? roles : perms.includes(p)),
    onAddTeam: vi.fn(async () => ({ team: { name: 'New', access_code: 'ABC' } })), onSwitchTeam: vi.fn(), onDeleteTeam: vi.fn(), onLeaveTeam: vi.fn(),
    activeTeamName: 'Robo',
  };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/teams" element={<PeoplePage {...props} />} />
          <Route path="/roles" element={<RolesSection {...props} />} />
        </Routes>
      </MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props };
}

const openMenu = async (name: string) => {
  fireEvent.pointerDown(screen.getByRole('button', { name: `Actions for ${name}` }), { button: 0, ctrlKey: false });
  return screen.findByRole('menu');
};

describe('Modern People — members', () => {
  it('lists members; members (non-admins) get no add/edit/remove', async () => {
    setup({ admin: false, roles: false });
    expect(screen.getByText('Grace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Invite people/ })).not.toBeInTheDocument();
    const menu = await openMenu('Grace');
    expect(within(menu).getByRole('menuitem', { name: /Voice call/ })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Edit member/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('calls a member through the voice context', async () => {
    setup();
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Video call/ }));
    expect(voice.startCall).toHaveBeenCalledWith([8], 'video');
  });

  it('invites people with a link instead of adding them by hand', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/invites' && init?.method === 'POST'
      ? json({ token: 'cpi_x', url: 'https://cp.test/join/cpi_abcdefghijklmnopqrstuvwx', invite: { id: 3 } })
      : url === '/api/invites' ? json([{ id: 2, hint: 'wxyz', uses: 1, max_uses: 5, expires_at: null, requires_approval: true, state: 'active', created_by_name: 'Ada' }])
      : routeApi(url)));
    setup();
    expect(screen.queryByRole('button', { name: /Add member/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Invite people/ }));
    const dlg = await screen.findByRole('dialog');
    expect(await within(dlg).findByText(/1\/5 used/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Approve each person' }));
    fireEvent.click(within(dlg).getByRole('button', { name: /Create invite link/ }));
    expect(await within(dlg).findByText(`${window.location.origin}/join/cpi_x`)).toBeInTheDocument();
    const body = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/invites' && c[1]?.method === 'POST')![1].body);
    expect(body).toEqual({ expires_in_hours: 168, max_uses: null, requires_approval: true });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Turn off link ending wxyz' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/invites/2', expect.objectContaining({ method: 'DELETE' })));
  });

  it('people with the Invite people permission (not admins) can invite; pending requests can be approved', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/join-requests'
      ? json([{ id: 4, email: 'new@x.test', name: 'Newt', source: 'invite', created_at: '' }])
      : url === '/api/join-requests/4/approve' ? json({ ok: true })
      : routeApi(url)));
    const { props } = setup({ admin: false, roles: false, perms: ['invite_members'] });
    expect(screen.getByRole('button', { name: /Invite people/ })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Join requests' });
    fireEvent.click(within(card).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/join-requests/4/approve', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
  });

  it('edits a member (PATCH) and the half-edited form survives a remount', async () => {
    const first = setup();
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Edit member/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Captain' } });
    first.unmount();
    setup();
    expect(((await screen.findByLabelText('Title')) as HTMLInputElement).value).toBe('Captain');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/members/8', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/members/8')![1].body)).toMatchObject({ role: 'Captain', account_type: 'student' });
  });

  it('demotes an admin with the Admin switch (H-2)', async () => {
    const admin2 = { ...grace, id: 9, name: 'Hopper', email: 'hopper@x.test', account_type: 'admin' };
    const props = {
      members: [me, admin2], teams, currentUser: me, refresh: { members: vi.fn() }, onRefresh: vi.fn(),
      hasScope: () => true, hasPerm: () => true, onAddTeam: vi.fn(), onSwitchTeam: vi.fn(), onDeleteTeam: vi.fn(), onLeaveTeam: vi.fn(), activeTeamName: 'Robo',
    };
    render(
      <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
        <MemoryRouter initialEntries={['/teams']}><Routes><Route path="/teams" element={<PeoplePage {...props} />} /></Routes></MemoryRouter>
      </InterfaceModeProvider>,
    );
    fireEvent.click(within(await openMenu('Hopper')).getByRole('menuitem', { name: /Edit member/ }));
    const toggle = await screen.findByRole('switch', { name: 'Admin' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/members/9', expect.objectContaining({ method: 'PATCH' })));
    const body = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/members/9')![1].body);
    expect(body.account_type).toBe('student');
    expect(body).not.toHaveProperty('scopes');
  });

  it('removes a member after confirming, and shows the server error if it fails', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/members/8' && init?.method === 'DELETE' ? json({ error: 'Last admin' }, false) : routeApi(url)));
    setup();
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Remove from team/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remove from team' }));
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('Last admin');
  });

  it('assigns a role from the member menu', async () => {
    setup();
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/roles'));
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Manage roles/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(await within(dlg).findByRole('option', { name: /Build Lead/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/members/8/roles', expect.objectContaining({ method: 'POST', body: JSON.stringify({ role_id: 2 }) })));
  });
});

describe('Settings → Roles', () => {
  it('creates a role (POST body as Legacy) and a half-written role survives a remount', async () => {
    const first = setup({ url: '/roles' });
    expect(await screen.findByText('Build Lead')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New role/ }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Drive Team' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Colour #3B82F6' }));
    first.unmount();
    setup({ url: '/roles' });
    expect(((await screen.findByLabelText('Name')) as HTMLInputElement).value).toBe('Drive Team');
    fireEvent.click(screen.getByRole('switch', { name: 'Manage members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/roles', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/roles' && c[1]?.method === 'POST')![1].body))
      .toEqual({ name: 'Drive Team', color: '#3B82F6', permissions: ['view_ai', 'manage_members'] });
  });

  it('system roles cannot be edited; without manage_roles the page is read-only', async () => {
    setup({ url: '/roles' });
    await screen.findByText('Build Lead');
    expect(screen.queryByRole('button', { name: 'Edit Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Build Lead' })).toBeInTheDocument();
    cleanup();
    setup({ url: '/roles', roles: false });
    await screen.findByText('Build Lead');
    expect(screen.queryByRole('button', { name: /New role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Build Lead' })).not.toBeInTheDocument();
  });

  it('deletes a custom role after confirm', async () => {
    setup({ url: '/roles' });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Build Lead' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/roles/2', { method: 'DELETE' }));
  });
});

describe('Modern People — workspaces', () => {
  it('admins edit a workspace with the Legacy PATCH body; others can switch or leave', async () => {
    const { props } = setup({ url: '/teams?tab=workspaces' });
    expect(screen.getByText('JOIN42')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Edit/ })[0]);
    fireEvent.change(await screen.findByLabelText('Team number'), { target: { value: '456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/teams/1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Robo', number: '456', accent_color: '' }) })));
    fireEvent.click(screen.getByRole('button', { name: /Switch/ }));
    expect(props.onSwitchTeam).toHaveBeenCalledWith(2);
    cleanup();
    const r = setup({ url: '/teams?tab=workspaces', admin: false });
    fireEvent.click(screen.getAllByRole('button', { name: /Leave/ })[0]);
    expect(r.props.onLeaveTeam).toHaveBeenCalledWith(teams[0]);
  });
});

describe('Modern People — review regressions', () => {
  it('reloads roles when the active workspace changes', async () => {
    const other = [{ id: 9, name: 'Pit Crew', color: '#22C55E', permissions: [], is_system: 0, member_count: 0, position: 0, team_id: 2 }];
    let call = 0;
    api.apiFetch.mockImplementation((url: string) => (url === '/api/roles' ? json(++call === 1 ? ROLES : other) : routeApi(url)));
    const props: any = {
      members: [me, grace], teams, currentUser: me, refresh: { members: vi.fn() }, onRefresh: vi.fn(),
      hasScope: () => true, hasPerm: () => true, onAddTeam: vi.fn(), onSwitchTeam: vi.fn(), onDeleteTeam: vi.fn(), onLeaveTeam: vi.fn(),
    };
    const tree = (user: any) => (
      <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
        <MemoryRouter initialEntries={['/roles']}><Routes><Route path="/roles" element={<RolesSection {...props} currentUser={user} />} /></Routes></MemoryRouter>
      </InterfaceModeProvider>
    );
    const { rerender } = render(tree(me));
    expect(await screen.findByText('Build Lead')).toBeInTheDocument();
    rerender(tree({ ...me, team_id: 2 }));
    expect(await screen.findByText('Pit Crew')).toBeInTheDocument();
    expect(screen.queryByText('Build Lead')).not.toBeInTheDocument();
  });

  it('New role still opens when roles failed to load', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/roles' ? Promise.reject(new Error('offline')) : routeApi(url)));
    setup({ url: '/roles' });
    expect(await screen.findByText('No roles loaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New role/ }));
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });

  it('a save that finishes after drafts were cleared never closes a newer editor', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/members/8' && init?.method === 'PATCH'
      ? new Promise((res) => { finish = () => res({ ok: true, json: async () => ({}) }); })
      : routeApi(url)));
    setup();
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Edit member/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/members/8', expect.objectContaining({ method: 'PATCH' })));
    // Workspace switch / sign-out clears drafts while the save is in flight…
    act(() => clearDrafts());
    // …and a new editor session starts.
    await waitFor(() => expect(screen.queryByLabelText('Title')).not.toBeInTheDocument());
    fireEvent.click(within(await openMenu('Grace')).getByRole('menuitem', { name: /Edit member/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Second' } });
    await act(async () => { finish(); });
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Second');
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled();
  });
});

