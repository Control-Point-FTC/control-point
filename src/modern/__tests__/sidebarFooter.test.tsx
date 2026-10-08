import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));

import { ModernShell } from '../ModernShell';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(() => { cleanup(); localStorage.clear(); });

function shell(over: Record<string, unknown> = {}) {
  const onOpenSettings = vi.fn();
  const onLogout = vi.fn();
  const noop = () => {};
  render(
    <MemoryRouter>
      <ModernShell
        visibleTabs={[{ id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard }] as any}
        activeTab="dashboard" pageTitle="Dashboard" onNavigate={noop} content={<p>page</p>}
        immersive={false} isMobile={false} user={{ id: 1, name: 'Ada' }} teams={[]} activeTeam={{ id: 1 }} activeTeamName="Robo"
        isAdmin onSwitchTeam={noop} unreadMentions={0} notifications={[]} onOpenSettings={onOpenSettings} onLogout={onLogout} onOpenBruno={noop}
        botName="Bruno" onOpenFeedback={noop} onSetupGuide={noop} onOpenWhatsNew={noop} onStatusPick={noop} predictSeen actions={[]}
        {...over}
      />
    </MemoryRouter>,
  );
  return { onOpenSettings, onLogout };
}

describe('sidebar footer (UX-12)', () => {
  it('Settings and Log out are one click, right next to the profile', () => {
    const { onOpenSettings, onLogout } = shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    // The profile menu is still there (status, theme, help).
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
    // The onboarding tour's settings step points at the visible gear.
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('data-onboard', 'nav-settings-gear');
  });

  it('the collapsed rail keeps both buttons', () => {
    localStorage.setItem('cp-modern-sidebar-collapsed', 'true');
    shell();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});

describe('Settings on phones', () => {
  it('is one tap from the top bar', () => {
    const { onOpenSettings } = shell({ isMobile: true });
    const gear = screen.getAllByRole('button', { name: 'Settings' })[0];
    fireEvent.click(gear);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('your own status chip', () => {
  it('shows the status you picked, not a stale "Offline" from page load', () => {
    shell({ user: { id: 1, name: 'Ada', presence: 'offline' } });
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('Online');
    cleanup();
    shell({ user: { id: 1, name: 'Ada', presence: 'online', presence_status: 'dnd' } });
    expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('Do Not Disturb');
    cleanup();
    shell({ user: { id: 1, name: 'Ada', presence_status: 'invisible' } });
    const chip = screen.getByRole('button', { name: 'Account menu' });
    expect(chip).toHaveTextContent('Invisible');
    expect(chip.querySelector('[title="Offline"]')).not.toBeNull();
  });
});
