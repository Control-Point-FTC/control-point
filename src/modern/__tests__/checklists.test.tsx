import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ confirmDialog: vi.fn(), notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { ChecklistsPage, templateFromText, templateToText } from '../pages/checklists/ChecklistsPage';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(cleanup);
beforeEach(() => { api.apiJson.mockReset(); dialog.confirmDialog.mockReset(); dialog.confirmDialog.mockResolvedValue(true); });

const sections = [{ id: 's1', title: 'Robot', items: [{ id: 'a', text: 'Battery charged' }, { id: 'b', text: 'Wheels tight' }] }];
const overview = {
  canManage: true,
  templates: [{ id: 1, title: 'Pre-match', description: '', starter: 'pre-match', sections, itemCount: 2 }],
  runs: [{ id: 7, title: 'Pre-match Q12', templateId: 1, eventId: null, eventTitle: null, status: 'open', startedAt: '2026-10-17T12:00:00Z', startedByName: 'Ana', finishedAt: null, finishedByName: null, progress: { done: 1, total: 2, partial: 0, na: 0 } }],
  starters: [{ key: 'pre-match', title: 'Pre-match', description: '', itemCount: 24 }, { key: 'pit-setup', title: 'Pit setup', description: '', itemCount: 27 }],
};
const run = { ...overview.runs[0], sections, items: { a: { state: 'done', note: '', assigneeId: null, assigneeName: null, setByName: 'Ana', setAt: '2026-10-17T12:05:00Z' } } };

function mockApi() {
  api.apiJson.mockImplementation(async (url: string, init?: any) => {
    if (url === '/api/checklists') return overview;
    if (url === '/api/checklists/runs/7' && !init?.method) return run;
    if (url.startsWith('/api/checklists/runs/7/items/')) return { ...run, items: { ...run.items, b: { state: 'done', setByName: 'Ada', setAt: new Date().toISOString() } }, progress: { done: 2, total: 2, partial: 0, na: 0 } };
    if (url === '/api/checklists/runs/7/reset') return { ...run, items: {}, progress: { done: 0, total: 2, partial: 0, na: 0 } };
    if (url === '/api/checklists/runs') return { id: 8 };
    return {};
  });
}

describe('Checklists page', () => {
  it('lists open runs with progress, checklists, and starters not yet added', async () => {
    mockApi();
    render(<ChecklistsPage />);
    expect(await screen.findByText('Pre-match Q12')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pit setup \(27\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pre-match \(24\)/ })).toBeNull(); // already added
  });

  it('checks an item off in a run, and reset asks first', async () => {
    mockApi();
    render(<ChecklistsPage />);
    fireEvent.click(await screen.findByText('Pre-match Q12'));
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(/Done by Ana/)).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Check off Wheels tight' }));
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/checklists/runs/7/items/b', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ state: 'done' }) })));
    fireEvent.click(within(sheet).getByRole('button', { name: /Reset/ }));
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalled());
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/checklists/runs/7/reset', expect.objectContaining({ method: 'POST' })));
  });

  it('starts a run from a checklist', async () => {
    mockApi();
    render(<ChecklistsPage events={[]} />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^Start$/ }))[0]);
    fireEvent.change(await screen.findByLabelText('Name (optional)'), { target: { value: 'Pre-match Q13' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Start/ }));
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/checklists/runs', expect.objectContaining({ method: 'POST', body: JSON.stringify({ templateId: 1, title: 'Pre-match Q13' }) })));
  });

  it('turns editor text into sections and back', () => {
    expect(templateFromText('## Power\n- Charger on\n- [ ] Battery in\n\n## Pit\nTable set')).toEqual([{ title: 'Power', items: ['Charger on', 'Battery in'] }, { title: 'Pit', items: ['Table set'] }]);
    expect(templateFromText('one\ntwo')).toEqual([{ title: '', items: ['one', 'two'] }]);
    expect(templateToText(sections)).toBe('## Robot\nBattery charged\nWheels tight');
    // A one-hash line is an item ("#10 wrench"), and an item starting with ## survives a round trip.
    expect(templateFromText('## Tools\n#10 wrench packed')).toEqual([{ title: 'Tools', items: ['#10 wrench packed'] }]);
    const odd = [{ id: 's1', title: 'Tools', items: [{ id: 'a', text: '## not a section' }] }];
    expect(templateFromText(templateToText(odd))).toEqual([{ title: 'Tools', items: ['## not a section'] }]);
  });

  it('a reply for a run that is no longer open on screen is ignored', async () => {
    let release: (v: any) => void = () => {};
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/checklists') return { ...overview, runs: [...overview.runs, { ...overview.runs[0], id: 8, title: 'Pit setup Fri' }] };
      if (url === '/api/checklists/runs/7' && !init?.method) return new Promise((r) => { release = r; }); // slow
      if (url === '/api/checklists/runs/8' && !init?.method) return { ...run, id: 8, title: 'Pit setup Fri' };
      return {};
    });
    render(<ChecklistsPage />);
    fireEvent.click(await screen.findByText('Pre-match Q12'));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('Pit setup Fri'));
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('Pit setup Fri')).toBeInTheDocument();
    release(run); // run 7's late reply
    await new Promise((r) => setTimeout(r, 20));
    expect(within(sheet).queryByText('Pre-match Q12')).toBeNull();
  });
});
