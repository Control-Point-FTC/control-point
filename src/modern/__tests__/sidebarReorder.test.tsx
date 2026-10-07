import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Calendar, CalendarCheck, CheckSquare, LayoutDashboard, Users } from 'lucide-react';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));

import { ModernShell } from '../ModernShell';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const tabs = [
  { id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'teams', path: 'teams', labelKey: 'nav.members', icon: Users },
  { id: 'attendance', path: 'attendance', labelKey: 'nav.attendance', icon: CalendarCheck },
  { id: 'calendar', path: 'calendar', labelKey: 'nav.calendar', icon: Calendar },
  { id: 'tasks', path: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare },
];

function shell() {
  const noop = () => {};
  return render(
    <MemoryRouter>
      <ModernShell
        visibleTabs={tabs as any} activeTab="dashboard" pageTitle="Dashboard" onNavigate={noop} content={<p>page</p>}
        immersive={false} isMobile={false} user={{ id: 1, name: 'Ada' }} teams={[]} activeTeam={{ id: 1 }} activeTeamName="Robo"
        isAdmin onSwitchTeam={noop} unreadMentions={0} notifications={[]} onOpenSettings={noop} onLogout={noop} onOpenBruno={noop}
        botName="Bruno" onOpenFeedback={noop} onSetupGuide={noop} onOpenWhatsNew={noop} onStatusPick={noop} predictSeen actions={[]}
      />
    </MemoryRouter>,
  );
}

const drag = (from: HTMLElement, to: HTMLElement) => {
  const dataTransfer = { effectAllowed: '', setData: () => {}, getData: () => '' };
  fireEvent.dragStart(from, { dataTransfer });
  fireEvent.dragOver(to, { dataTransfer });
  fireEvent.drop(to, { dataTransfer });
  fireEvent.dragEnd(from, { dataTransfer });
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('sidebar reordering', () => {
  it('dragging a page in the expanded sidebar saves the new order', () => {
    shell();
    const tasks = screen.getByRole('link', { name: /tasks/i }).parentElement!;
    const members = screen.getByRole('link', { name: /members/i }).parentElement!;
    drag(tasks, members);
    expect(JSON.parse(localStorage.getItem('cp-sidebar-order') || 'null')?.items?.team?.[0]).toBe('tasks');
  });

  it('in the collapsed rail, dragging a link changes nothing', () => {
    localStorage.setItem('cp-modern-sidebar-collapsed', 'true');
    shell();
    const tasks = screen.getByRole('link', { name: /tasks/i });
    const members = screen.getByRole('link', { name: /members/i });
    drag(tasks, members.parentElement!);
    expect(localStorage.getItem('cp-sidebar-order')).toBeNull();
  });
});
