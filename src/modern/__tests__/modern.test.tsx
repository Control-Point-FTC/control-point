import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor } from '@testing-library/react';
import { Users, ShieldCheck, Box, FileBox, LayoutDashboard, MessageSquare, Trophy, Wallet } from 'lucide-react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider, resolveInterfaceMode, useInterfaceMode } from '../interfaceMode';
import { ShellSwitch } from '../ShellSwitch';
import { useDraft, clearDrafts } from '../drafts';
import { buildModernNav, flattenNav } from '../nav';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); clearDrafts(); });

describe('resolveInterfaceMode', () => {
  it('prefers the user choice, then the team default, then legacy', () => {
    expect(resolveInterfaceMode('modern', 'legacy')).toBe('modern');
    expect(resolveInterfaceMode(null, 'modern')).toBe('modern');
    expect(resolveInterfaceMode(undefined, undefined)).toBe('legacy');
    expect(resolveInterfaceMode('bogus', 'nope')).toBe('legacy');
  });
});

function Probe() {
  const { mode, setMode } = useInterfaceMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => void setMode('modern')}>modern</button>
    </div>
  );
}

describe('InterfaceModeProvider', () => {
  it('switches instantly and keeps the choice after the save', async () => {
    let resolve!: (v: any) => void;
    api.apiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const saved = vi.fn();
    render(<InterfaceModeProvider user={{ id: 1, name: 'A', role: '' }} team={{}} onUserSaved={saved}><Probe /></InterfaceModeProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('legacy');
    fireEvent.click(screen.getByText('modern'));
    // Optimistic: already modern while the request is in flight.
    expect(screen.getByTestId('mode').textContent).toBe('modern');
    await act(async () => { resolve({ ok: true, json: async () => ({ user: { id: 1, interface_mode: 'modern' } }) }); });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ interface_mode: 'modern' }));
    const body = JSON.parse(api.apiFetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ interface_mode: 'modern', name: 'A' });
  });

  it('rolls back when the save fails', async () => {
    api.apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={{}} onUserSaved={() => {}}><Probe /></InterfaceModeProvider>);
    fireEvent.click(screen.getByText('modern'));
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('legacy'));
  });

  it('uses the team default when the user has not chosen', () => {
    render(<InterfaceModeProvider user={{ id: 1 }} team={{ default_interface_mode: 'modern' }} onUserSaved={() => {}}><Probe /></InterfaceModeProvider>);
    expect(screen.getByTestId('mode').textContent).toBe('modern');
  });
});

function Composer({ label }: { label: string }) {
  const [text, setText] = useDraft<string>('chat:content', '');
  const [file, setFile] = useDraft<File | null>('chat:file', null);
  return (
    <div>
      <p>{label}</p>
      <input aria-label="message" value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={() => setFile(new File(['x'], 'robot.png', { type: 'image/png' }))}>attach</button>
      <span data-testid="file">{file?.name ?? ''}</span>
    </div>
  );
}

describe('switching modes keeps drafts', () => {
  it('an unsent message and attachment survive Legacy → Modern', async () => {
    api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { id: 1, interface_mode: 'modern' } }) });
    function App() {
      return (
        <ShellSwitch
          legacy={<div><Composer label="legacy shell" /><Probe /></div>}
          modern={() => <section><Composer label="modern shell" /></section>}
        />
      );
    }
    render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={{}} onUserSaved={() => {}}><App /></InterfaceModeProvider>);
    expect(screen.getByText('legacy shell')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('message'), { target: { value: 'half-typed note' } });
    fireEvent.click(screen.getByText('attach'));
    fireEvent.click(screen.getByText('modern'));
    expect(await screen.findByText('modern shell')).toBeInTheDocument();
    expect((screen.getByLabelText('message') as HTMLInputElement).value).toBe('half-typed note');
    expect(screen.getByTestId('file').textContent).toBe('robot.png');
  });
});

describe('buildModernNav', () => {
  const visible: any[] = [
    { id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, pinned: true },
    { id: 'chat', path: 'chat', labelKey: 'nav.messaging', icon: MessageSquare, pinned: true },
    { id: 'stats', path: 'stats', labelKey: 'nav.teamStats', icon: Trophy, group: 'Compete' },
    { id: 'teams', path: 'teams', labelKey: 'nav.teamsMembers', icon: Users, group: 'Team', children: [
      { id: 'teams', path: 'teams', labelKey: 'nav.members', icon: Users },
      { id: 'roles', path: 'roles', labelKey: 'nav.roles', icon: ShieldCheck },
    ] },
    { id: 'cad', path: 'cad', labelKey: 'nav.cad', icon: Box, group: 'Engineering', children: [
      { id: 'cad', path: 'cad', labelKey: 'nav.cadDashboard', icon: Box },
      { id: 'cad-docs', path: 'cad-docs', labelKey: 'nav.onshapeDocs', icon: FileBox },
    ] },
    { id: 'budget', path: 'budget', labelKey: 'nav.budget', icon: Wallet, group: 'Outreach' },
  ];

  it('only contains items the Legacy sidebar shows, grouped into Modern sections', () => {
    const nav = buildModernNav(visible);
    expect(nav.primary.map((i) => i.id)).toEqual(['dashboard', 'chat']);
    expect(nav.sections.map((s) => s.id)).toEqual(['team', 'compete', 'build', 'ops']);
    const ids = flattenNav(nav).map((i) => i.id);
    expect(ids.sort()).toEqual(['budget', 'cad', 'chat', 'dashboard', 'roles', 'stats', 'teams'].sort());
    // CAD keeps its sub-pages inside the page; they still highlight CAD.
    expect(nav.sections.find((s) => s.id === 'build')!.items[0].matches).toEqual(['cad', 'cad', 'cad-docs']);
  });

  it('never invents a hidden item (no Roles when the parent has no Roles child)', () => {
    const noRoles = visible.map((t) => (t.id === 'teams' ? { ...t, children: [t.children[0]] } : t));
    expect(flattenNav(buildModernNav(noRoles)).some((i) => i.id === 'roles')).toBe(false);
  });
});
