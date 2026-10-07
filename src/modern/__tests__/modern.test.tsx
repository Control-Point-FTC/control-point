import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { Users, ShieldCheck, Box, FileBox, LayoutDashboard, MessageSquare, Trophy, Wallet } from 'lucide-react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider, resolveInterfaceMode, useInterfaceMode } from '../interfaceMode';
import { clearDrafts } from '../drafts';
import { buildModernNav, flattenNav } from '../nav';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); clearDrafts(); });

describe('Classic retired', () => {
  it('everyone gets Modern, whatever look was saved before', () => {
    expect(resolveInterfaceMode('legacy', 'legacy')).toBe('modern');
    function Probe() {
      const { mode } = useInterfaceMode();
      return <span data-testid="mode">{mode}</span>;
    }
    render(
      <InterfaceModeProvider user={{ id: 1, interface_mode: 'legacy' }} team={{ default_interface_mode: 'legacy' }} onUserSaved={() => {}}>
        <Probe />
      </InterfaceModeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('modern');
    expect(document.documentElement.dataset.ui).toBe('modern');
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
    // With reduced motion it renders the final text immediately.
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as any;
    try {
      const de = (n: number) => `$${n.toLocaleString('de-DE')}`;
      render(<InterfaceModeProvider user={{ id: 1 }} team={{}} onUserSaved={() => {}}><AnimatedValue value={de(3.5)} to={3.5} format={de} /></InterfaceModeProvider>);
      expect(screen.getByText('$3,5')).toBeInTheDocument();
    } finally {
      window.matchMedia = mm;
    }
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
