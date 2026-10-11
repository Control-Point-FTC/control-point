import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { ScoutingWorkspace } from '../pages/stats/ScoutingWorkspace';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });

let online = true;
beforeEach(() => {
  localStorage.clear();
  api.apiFetch.mockReset();
  dialog.notify.mockReset();
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Entries this member has waiting on the device (one storage key each). */
const queued = () => Object.keys(localStorage).filter((k) => k.startsWith('cp-scout-q:1:7:')).length;

function fillAndSave(team: string) {
  fireEvent.click(screen.getAllByRole('button', { name: /Scout a match/ })[0]);
  fireEvent.change(screen.getByLabelText('Team #'), { target: { value: team } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Artifacts scored plus one' })[1]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Artifacts scored plus one' })[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('Scout tab (manual scouting, H-4)', () => {
  it('saves offline on the device, then syncs when the connection is back', async () => {
    online = false;
    api.apiFetch.mockImplementation(() => json({ entries: [] }));
    render(<ScoutingWorkspace season={2025} teamId={1} currentMemberId={7} />);
    expect(screen.getByText(/No scouting yet/)).toBeInTheDocument();
    fillAndSave('4215');
    // Shown right away from the device, flagged as waiting.
    expect(await screen.findByRole('button', { name: '#4215' })).toBeInTheDocument();
    expect(screen.getByText(/Offline · 1 waiting/)).toBeInTheDocument();
    expect(api.apiFetch).not.toHaveBeenCalledWith('/api/scouting/sync', expect.anything());
    expect(queued()).toBe(1);

    // Back online: the outbox is sent and cleared.
    online = true;
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/scouting/sync') {
        const sent = JSON.parse(init.body).entries;
        return json({ results: sent.map((e: any) => ({ uuid: e.uuid, ok: true })), entries: sent.map((e: any) => ({ ...e, scoutName: 'Ada', scoutMemberId: 7 })) });
      }
      return json({ entries: [] });
    });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/scouting/sync', expect.objectContaining({ method: 'POST' })));
    const sent = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/scouting/sync')![1].body);
    expect(sent.entries[0]).toMatchObject({ season: 2025, scoutedTeam: 4215, templateId: 'decode-2025', data: { teleop_artifacts: 2 } });
    await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
    expect(queued()).toBe(0);
    // The team table rolls it up.
    const row = screen.getByRole('button', { name: '#4215' }).closest('tr')!;
    expect(within(row).getByText('2.0')).toBeInTheDocument();
  });

  it('if the device can’t store the entry, the form stays open with an error', async () => {
    online = false;
    api.apiFetch.mockImplementation(() => json({ entries: [] }));
    render(<ScoutingWorkspace season={2025} teamId={1} currentMemberId={7} />);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k: string) => {
      if (k.startsWith('cp-scout-q:')) throw new DOMException('full', 'QuotaExceededError');
    });
    fillAndSave('4215');
    expect(dialog.notify).toHaveBeenCalledWith(expect.stringMatching(/couldn’t store the entry/), 'error');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(); // still open
    expect(screen.queryByRole('button', { name: '#4215' })).not.toBeInTheDocument();
    setItem.mockRestore();
  });

  it('only this member’s queue is sent', async () => {
    online = true;
    localStorage.setItem('cp-scout-q:1:99:' + 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', JSON.stringify({ uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', season: 2025, scoutedTeam: 1, templateId: 'generic', data: {}, notes: 'someone else', updatedAt: 1 }));
    api.apiFetch.mockImplementation(() => json({ entries: [] }));
    render(<ScoutingWorkspace season={2025} teamId={1} currentMemberId={7} />);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    expect(api.apiFetch).not.toHaveBeenCalledWith('/api/scouting/sync', expect.anything());
  });

  it('switching season while a load is in flight still loads the new season', async () => {
    online = true;
    api.apiFetch.mockImplementation((url: string) => (url.includes('season=2025') ? new Promise(() => {}) : json({ entries: [] })));
    const { rerender } = render(<ScoutingWorkspace season={2025} teamId={1} currentMemberId={7} />);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/scouting/entries?season=2025', expect.anything()));
    rerender(<ScoutingWorkspace season={2024} teamId={1} currentMemberId={7} />);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/scouting/entries?season=2024', expect.anything()));
    await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument());
  });

  it('a team number is required', async () => {
    api.apiFetch.mockImplementation(() => json({ entries: [] }));
    render(<ScoutingWorkspace season={2025} teamId={1} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Scout a match/ })[0]);
    fireEvent.submit(screen.getByLabelText('Team #').closest('form')!);
    expect(dialog.notify).toHaveBeenCalledWith('Enter the team number you scouted', 'error');
  });
});

describe('Scout tab: a link to a scouting entry', () => {
  it("starts on the linked team's entries", async () => {
    const entry = (team: number, uuid: string) => ({ uuid, season: 2025, scoutedTeam: team, eventCode: 'USCAFFL', matchLabel: 'Q12', templateId: 'default', data: {}, notes: '', updatedAt: 1 });
    api.apiFetch.mockImplementation(() => json({ entries: [entry(12345, '11111111-1111-4111-8111-111111111111'), entry(999, '22222222-2222-4222-8222-222222222222')] }));
    render(<ScoutingWorkspace season={2025} teamId={1} currentMemberId={7} initialFocusTeam={12345} />);
    expect(await screen.findByText('Entries for #12345')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Scouting entries' });
    expect(within(list).queryByText('#999')).toBeNull();
  });
});
