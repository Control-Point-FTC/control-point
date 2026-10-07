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
    expect(JSON.parse(localStorage.getItem('cp-scout-outbox:1') || '[]')).toHaveLength(1);

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
    expect(JSON.parse(localStorage.getItem('cp-scout-outbox:1') || '[]')).toHaveLength(0);
    // The team table rolls it up.
    const row = screen.getByRole('button', { name: '#4215' }).closest('tr')!;
    expect(within(row).getByText('2.0')).toBeInTheDocument();
  });

  it('a team number is required', async () => {
    api.apiFetch.mockImplementation(() => json({ entries: [] }));
    render(<ScoutingWorkspace season={2025} teamId={1} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Scout a match/ })[0]);
    fireEvent.submit(screen.getByLabelText('Team #').closest('form')!);
    expect(dialog.notify).toHaveBeenCalledWith('Enter the team number you scouted', 'error');
  });
});
