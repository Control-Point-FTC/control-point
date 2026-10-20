// The phone's More sheet hands focus back to More when it closes, and so does
// anything opened from it (the sheet closes as they open, taking the row or
// menu item that opened them along). Focus used to fall to <body>.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';

vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })) }));

import { ModernShell } from '../ModernShell';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui-kit';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(() => { cleanup(); localStorage.clear(); });

/** The phone shell, with What's new opened from state the way App does it. */
function Phone() {
  const [whatsNew, setWhatsNew] = useState(false);
  const noop = () => {};
  return (
    <MemoryRouter>
      <ModernShell
        visibleTabs={[{ id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard }] as any}
        activeTab="dashboard" pageTitle="Dashboard" onNavigate={noop} content={<p>page</p>}
        immersive={false} isMobile user={{ id: 1, name: 'Ada' }} teams={[]} activeTeam={{ id: 1 }} activeTeamName="Robo"
        isAdmin onSwitchTeam={noop} unreadMentions={0} notifications={[]} onOpenSettings={noop} onLogout={noop} onOpenBruno={noop}
        botName="Bruno" onOpenFeedback={noop} onSetupGuide={noop} onOpenWhatsNew={() => setWhatsNew(true)} onStatusPick={noop} predictSeen actions={[]}
      />
      <Dialog open={whatsNew} onOpenChange={setWhatsNew}>
        <DialogContent><DialogTitle>What's new</DialogTitle><DialogDescription>Releases</DialogDescription></DialogContent>
      </Dialog>
    </MemoryRouter>
  );
}

const openMore = async (how: string) => {
  const more = screen.getByRole('button', { name: 'More' });
  if (how === 'keyboard') act(() => more.focus()); else (document.activeElement as HTMLElement | null)?.blur();
  fireEvent.click(more);
  const sheet = await screen.findByRole('dialog', { name: 'Menu' });
  await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
  return { more, sheet };
};
const escape = async () => {
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};

describe('the More sheet returns focus to More', () => {
  it.each(['keyboard', 'tap'])('closing the sheet (%s)', async (how) => {
    render(<Phone />);
    const { more } = await openMore(how);
    await escape();
    expect(document.activeElement).toBe(more);
  });

  it.each(['keyboard', 'tap'])("What's new from the sheet's account menu (%s)", async (how) => {
    render(<Phone />);
    const { more, sheet } = await openMore(how);
    const account = within(sheet).getByRole('button', { name: 'Account menu' });
    act(() => account.focus());
    fireEvent.keyDown(account, { key: 'Enter' });
    const item = within(await screen.findByRole('menu')).getByRole('menuitem', { name: "What's new" });
    act(() => item.focus());
    fireEvent.keyDown(item, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: "What's new" });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});
