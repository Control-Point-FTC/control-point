import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })), apiJson: vi.fn(async () => []) }));

import { ModernShell } from '../ModernShell';
import { setStickyNotesOpen } from '../../notebook/stickyNotesState';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(() => { cleanup(); localStorage.clear(); act(() => setStickyNotesOpen(false)); });

function shell(isMobile = false) {
  const noop = () => {};
  render(
    <MemoryRouter>
      <ModernShell
        visibleTabs={[{ id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard }] as any}
        activeTab="dashboard" pageTitle="Dashboard" onNavigate={noop} content={<p>page</p>}
        immersive={false} isMobile={isMobile} user={{ id: 1, name: 'Ada' }} teams={[]} activeTeam={{ id: 1 }} activeTeamName="Robo"
        isAdmin onSwitchTeam={noop} unreadMentions={0} notifications={[]} onOpenSettings={noop} onLogout={noop} onOpenBruno={noop}
        botName="Bruno" onOpenFeedback={noop} onSetupGuide={noop} onOpenWhatsNew={noop} onStatusPick={noop} predictSeen actions={[]}
      />
    </MemoryRouter>,
  );
}

describe('Sticky Notes in the top bar', () => {
  it('sits between the weather and Search, and opens the app-wide panel', async () => {
    shell();
    const button = screen.getByRole('button', { name: 'Sticky notes' });
    expect(button.nextElementSibling).toBe(screen.getByRole('button', { name: 'Search' }));
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('complementary', { name: 'Sticky notes' })).toBeInTheDocument();
  });

  it('is not offered on phones (the notebook is text-only there)', () => {
    shell(true);
    expect(screen.queryByRole('button', { name: 'Sticky notes' })).toBeNull();
  });
});
