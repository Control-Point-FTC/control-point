import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const voice = vi.hoisted(() => ({ startCall: vi.fn() }));
vi.mock('../../voice/VoiceContext', () => ({ useVoice: () => voice }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { PeoplePage } from '../pages/people/PeoplePage';
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

function setup({ admin = true, roles = true, url = '/teams' } = {}) {
  const props = {
    members: [me, grace], teams, currentUser: me, refresh: { members: vi.fn() }, onRefresh: vi.fn(),
    hasScope: (s: string) => (s === 'admin' ? admin : false), hasPerm: (p: string) => (p === 'manage_roles' ? roles : false),
    onAddTeam: vi.fn(async () => ({ team: { name: 'New', access_code: 'ABC' } })), onSwitchTeam: vi.fn(), onDeleteTeam: vi.fn(), onLeaveTeam: vi.fn(),
    activeTeamName: 'Robo',
  };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/teams" element={<PeoplePage {...props} />} />
          <Route path="/roles" element={<PeoplePage {...props} />} />
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
    expect(screen.queryByRole('button', { name: /Add member/ })).not.toBeInTheDocument();
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

  it('adds a member with the same POST body as Legacy', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Add member/ }));
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Linus' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'linus@x.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/members', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/members')![1].body);
    expect(body).toEqual({ team_id: '', name: 'Linus', role: '', email: 'linus@x.test', is_board: false, scopes: [] });
    await waitFor(() => expect(props.refresh.members).toHaveBeenCalled());
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
    expect(JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/members/8')![1].body)).toMatchObject({ role: 'Captain', scopes: [] });
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

describe('Modern People — roles', () => {
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
