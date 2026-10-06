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

// Start these in Classic: the workspace default (the user hasn't chosen).
const LEGACY_TEAM = { default_interface_mode: 'legacy' };

describe('resolveInterfaceMode', () => {
  it('prefers the user choice, then the team default, then Modern (the default since 9e)', () => {
    expect(resolveInterfaceMode('modern', 'legacy')).toBe('modern');
    expect(resolveInterfaceMode(null, 'legacy')).toBe('legacy');
    expect(resolveInterfaceMode(undefined, undefined)).toBe('modern');
    expect(resolveInterfaceMode('bogus', 'nope')).toBe('modern');
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
    render(<InterfaceModeProvider user={{ id: 1, name: 'A', role: '' }} team={LEGACY_TEAM} onUserSaved={saved}><Probe /></InterfaceModeProvider>);
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
    render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={LEGACY_TEAM} onUserSaved={() => {}}><Probe /></InterfaceModeProvider>);
    fireEvent.click(screen.getByText('modern'));
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('legacy'));
  });

  it('does not merge a stale save into a different membership', async () => {
    let resolve!: (v: any) => void;
    api.apiFetch.mockReturnValue(new Promise((r) => { resolve = r; }));
    const saved = vi.fn();
    const { rerender } = render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={LEGACY_TEAM} onUserSaved={saved}><Probe /></InterfaceModeProvider>);
    fireEvent.click(screen.getByText('modern'));
    // The user switches workspace (new membership row) before the save returns.
    rerender(<InterfaceModeProvider user={{ id: 2, name: 'A' }} team={LEGACY_TEAM} onUserSaved={saved}><Probe /></InterfaceModeProvider>);
    await act(async () => { resolve({ ok: true, json: async () => ({ user: { id: 1, team_id: 10, interface_mode: 'modern' } }) }); });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith({ id: 2, interface_mode: 'modern' });
  });

  it('ignores an older save that finishes after a newer choice', async () => {
    const resolvers: ((v: any) => void)[] = [];
    api.apiFetch.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    const saved = vi.fn();
    function Two() {
      const { mode, setMode } = useInterfaceMode();
      return (<div><span data-testid="mode">{mode}</span>
        <button onClick={() => void setMode('modern')}>m</button><button onClick={() => void setMode('legacy')}>l</button></div>);
    }
    render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={{}} onUserSaved={saved}><Two /></InterfaceModeProvider>);
    fireEvent.click(screen.getByText('m'));
    fireEvent.click(screen.getByText('l'));
    await act(async () => { resolvers[0]({ ok: true, json: async () => ({ user: { id: 1, interface_mode: 'modern' } }) }); });
    expect(screen.getByTestId('mode').textContent).toBe('legacy');
    expect(saved).not.toHaveBeenCalled();
    await act(async () => { resolvers[1]({ ok: true, json: async () => ({ user: { id: 1, interface_mode: 'legacy' } }) }); });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ interface_mode: 'legacy' }));
  });

  it('falls back to the older successful save when the newer one fails', async () => {
    const resolvers: ((v: any) => void)[] = [];
    api.apiFetch.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));
    function Two() {
      const { mode, setMode } = useInterfaceMode();
      return (<div><span data-testid="mode">{mode}</span>
        <button onClick={() => void setMode('modern')}>m</button><button onClick={() => void setMode('legacy')}>l</button></div>);
    }
    render(<InterfaceModeProvider user={{ id: 1, name: 'A', interface_mode: 'legacy' }} team={{}} onUserSaved={() => {}}><Two /></InterfaceModeProvider>);
    fireEvent.click(screen.getByText('m'));
    fireEvent.click(screen.getByText('l'));
    await act(async () => { resolvers[0]({ ok: true, json: async () => ({ user: { id: 1, interface_mode: 'modern' } }) }); });
    expect(screen.getByTestId('mode').textContent).toBe('legacy'); // newer choice still showing
    await act(async () => { resolvers[1]({ ok: false, json: async () => ({ error: 'x' }) }); });
    // The server holds Modern (the older save succeeded), so that's what shows.
    expect(screen.getByTestId('mode').textContent).toBe('modern');
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
    render(<InterfaceModeProvider user={{ id: 1, name: 'A' }} team={LEGACY_TEAM} onUserSaved={() => {}}><App /></InterfaceModeProvider>);
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

import { interpolateNumbers } from '../AnimatedValue';
describe('interpolateNumbers', () => {
  it('keeps the format while counting', () => {
    expect(interpolateNumbers('12 / 18', 0.5)).toBe('6 / 9');
    expect(interpolateNumbers('$1,250', 1)).toBe('$1,250');
    expect(interpolateNumbers('$1,250', 0)).toBe('$0');
    expect(interpolateNumbers('Nothing', 0.3)).toBe('Nothing');
  });
});

import { AnimatedValue } from '../AnimatedValue';
describe('AnimatedValue', () => {
  it('formats the raw number (decimal-comma locales are never re-parsed)', () => {
    // In Classic it renders the final text immediately.
    const de = (n: number) => `$${n.toLocaleString('de-DE')}`;
    render(<InterfaceModeProvider user={{ id: 1, interface_mode: 'legacy' }} team={{}} onUserSaved={() => {}}><AnimatedValue value={de(3.5)} to={3.5} format={de} /></InterfaceModeProvider>);
    expect(screen.getByText('$3,5')).toBeInTheDocument();
  });

  it('animates the raw amount in Modern without re-parsing locale text', async () => {
    const de = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString('de-DE')}`;
    const seen: number[] = [];
    render(
      <InterfaceModeProvider user={{ id: 1, interface_mode: 'modern' }} team={{}} onUserSaved={() => {}}>
        <span data-testid="amt"><AnimatedValue value={de(3.5)} to={3.5} format={de} duration={120} /></span>
      </InterfaceModeProvider>,
    );
    for (let i = 0; i < 12; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const txt = screen.getByTestId('amt').textContent || '';
      seen.push(Number(txt.replace('$', '').replace(',', '.')));
    }
    // Every intermediate value stays within 0..3.5 (a misparse would show 35).
    expect(seen.every((n) => Number.isFinite(n) && n >= 0 && n <= 3.5)).toBe(true);
    expect(screen.getByTestId('amt').textContent).toBe('$3,5');
  });
});
