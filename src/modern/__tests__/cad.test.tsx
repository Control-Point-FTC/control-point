import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));
vi.mock('../../components/CadModelViewer', () => ({ default: ({ fileName, onClose }: any) => <div role="dialog" aria-label="3D viewer">{fileName}<button onClick={onClose}>Close viewer</button></div> }));

import { InterfaceModeProvider } from '../interfaceMode';
import { CadPage } from '../pages/cad/CadPage';
import { clearDrafts, setDraft } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const calls = (url: string, method?: string) => api.apiFetch.mock.calls.filter((c) => c[0] === url && (method ? c[1]?.method === method : !c[1]?.method));

let db: Record<string, any>;
const fresh = () => ({
  '/api/cad/dashboard': { docsCount: 2, pendingReviews: 1, snapshotsCount: 1, partsCount: 3, partsTotalCost: 120.5, needsAttention: [{ id: 5, title: 'Intake v3', section: 'Intake', author_name: 'Bo', updated_at: '2026-09-01' }], recent: [{ kind: 'doc', id: 1, title: 'Robot assembly', ts: '2026-09-02' }] },
  '/api/cad/docs': [{ id: 1, name: 'Robot assembly', url: 'https://cad.onshape.com/documents/a', created_at: '2026-09-01' }],
  '/api/cad/reviews': [
    { id: 5, title: 'Intake v3', section: 'Intake', status: 'concept', created_by: 7, author_name: 'Ada', created_at: '2026-09-01', comment_count: 1, description: 'Dual roller' },
    { id: 6, title: 'Lift v2', section: 'Outtake', status: 'in_review', created_by: 9, author_name: 'Bo', created_at: '2026-09-02', comment_count: 0 },
  ],
  '/api/cad/reviews/5/comments': [{ id: 1, author_name: 'Bo', comment: 'Looks good', created_at: '2026-09-03' }],
  '/api/cad/reviews/6/comments': [],
  '/api/cad/snapshots': [
    { id: 11, title: 'Intake milestone', section: 'Intake', file_type: 'stl', file_size: 2048, file_url: '/f/a.stl', created_by: 7, author_name: 'Ada' },
    { id: 12, title: 'Chassis', section: 'Chassis', file_type: 'step', file_size: 4096, file_url: '/f/b.step', created_by: 9, author_name: 'Bo' },
  ],
  '/api/cad/parts': [
    { id: 21, name: 'Omni wheel', section: 'Drivetrain', quantity: 4, source: 'gobilda', unit_cost: 10, status: 'installed', assignee: 'Ada' },
    { id: 22, name: 'Servo', section: 'Intake', quantity: 2, source: 'purchased', unit_cost: 30, status: 'to_order', assignee: '' },
  ],
});

beforeEach(() => {
  db = fresh();
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => (init?.method ? json({ id: 99 }) : json(db[url] ?? [])));
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});
afterEach(cleanup);

let loc = '';
function Where() { loc = useLocation().pathname; return null; }
const setup = (tab: string, isAdmin = false) => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter initialEntries={[`/${tab}`]}>
      <Routes><Route path="*" element={<><CadPage activeTab={tab} currentUser={{ id: 7 }} isAdmin={isAdmin} /><Where /></>} /></Routes>
    </MemoryRouter>
  </InterfaceModeProvider>,
);
const menu = async (label: string, item: RegExp) => {
  fireEvent.pointerDown(screen.getAllByRole('button', { name: label })[0], { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

describe('Modern CAD', () => {
  it('overview: stats, the review queue and activity; tiles navigate', async () => {
    setup('cad');
    expect(await screen.findByText('Intake v3')).toBeInTheDocument();
    expect(screen.getByText('$120.50 total')).toBeInTheDocument();
    expect(screen.getByText('Robot assembly')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Parts/ }));
    expect(loc).toBe('/cad-parts');
  });

  it('docs: link (POST) clears the form; unlink after confirm', async () => {
    setup('cad-docs');
    await screen.findByText('Robot assembly');
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Drivetrain' } });
    fireEvent.change(screen.getByLabelText('Onshape link'), { target: { value: 'https://cad.onshape.com/documents/d' } });
    fireEvent.click(screen.getByRole('button', { name: /Link/ }));
    await waitFor(() => expect(calls('/api/cad/docs', 'POST')).toHaveLength(1));
    expect(JSON.parse(calls('/api/cad/docs', 'POST')[0][1].body)).toEqual({ name: 'Drivetrain', url: 'https://cad.onshape.com/documents/d' });
    await waitFor(() => expect(screen.getByLabelText('Document name')).toHaveValue(''));
    expect(calls('/api/cad/docs').length).toBeGreaterThanOrEqual(2); // refetched
    await menu('Actions for Robot assembly', /Unlink/);
    await waitFor(() => expect(calls('/api/cad/docs/1', 'DELETE')).toHaveLength(1));
  });

  it('reviews: authors can only submit their own concept; others see no moves', async () => {
    setup('cad-reviews');
    fireEvent.click(await screen.findByRole('button', { name: /Intake v3/ }));
    let sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /Submit for Review/ })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(within(sheet).getByText('Looks good')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /Submit for Review/ }));
    await waitFor(() => expect(calls('/api/cad/reviews/5', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(calls('/api/cad/reviews/5', 'PATCH')[0][1].body)).toEqual({ status: 'in_review' });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Lift v2/ }));
    sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: /Approve|Request Changes|Submit for Review/ })).not.toBeInTheDocument();
  });

  it('reviews: admins approve / request changes / mark built and delete; comments post and refresh', async () => {
    setup('cad-reviews', true);
    fireEvent.click(await screen.findByRole('button', { name: /Lift v2/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /Approve/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Request Changes/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Mark Built/ })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Add a comment'), { target: { value: 'Ship it' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send comment' }));
    await waitFor(() => expect(calls('/api/cad/reviews/6/comments', 'POST')).toHaveLength(1));
    await waitFor(() => expect(within(sheet).getByLabelText('Add a comment')).toHaveValue(''));
    expect(calls('/api/cad/reviews/6/comments').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(sheet).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(calls('/api/cad/reviews/6', 'DELETE')).toHaveLength(1));
  });

  it('submit design: title required, then a FormData POST; a half-written design survives a remount', async () => {
    const first = setup('cad-reviews');
    fireEvent.click(await screen.findByRole('button', { name: /Submit design/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
    expect(dialog.notify).toHaveBeenCalledWith('Give the design a title.', 'error');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Climber v1' } });
    first.unmount();
    setup('cad-reviews');
    expect(await screen.findByLabelText('Title')).toHaveValue('Climber v1');
    fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }));
    await waitFor(() => expect(calls('/api/cad/reviews', 'POST')).toHaveLength(1));
    const fd = calls('/api/cad/reviews', 'POST')[0][1].body as FormData;
    expect(fd.get('title')).toBe('Climber v1');
    expect(fd.get('section')).toBe('Intake');
    await waitFor(() => expect(screen.queryByLabelText('Title')).not.toBeInTheDocument());
  });

  it('snapshots: grouped by subsystem, 3D viewer, delete only your own (or as admin), upload needs a STEP/STL', async () => {
    setup('cad-snapshots');
    expect(await screen.findByRole('heading', { name: 'Chassis' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Intake milestone in 3D' }));
    expect(await screen.findByRole('dialog', { name: '3D viewer' })).toHaveTextContent('Intake milestone');
    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Chassis' }), { button: 0, ctrlKey: false });
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await menu('Actions for Intake milestone', /Delete/);
    await waitFor(() => expect(calls('/api/cad/snapshots/11', 'DELETE')).toHaveLength(1));
    fireEvent.click(screen.getAllByRole('button', { name: /Upload snapshot/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /^Upload$/ }));
    expect(dialog.notify).toHaveBeenCalledWith('Choose a STEP or STL file.', 'error');
    fireEvent.change(screen.getByLabelText('3D model (.step / .stp / .stl)'), { target: { files: [new File(['x'], 'arm.obj')] } });
    fireEvent.click(screen.getByRole('button', { name: /^Upload$/ }));
    expect(dialog.notify).toHaveBeenCalledWith('Model must be .step/.stp or .stl.', 'error');
    fireEvent.change(screen.getByLabelText('3D model (.step / .stp / .stl)'), { target: { files: [new File(['x'], 'arm.stl')] } });
    fireEvent.click(screen.getByRole('button', { name: /^Upload$/ }));
    await waitFor(() => expect(calls('/api/cad/snapshots', 'POST')).toHaveLength(1));
    expect((calls('/api/cad/snapshots', 'POST')[0][1].body as FormData).get('title')).toBe('arm.stl');
  });

  it('parts: BOM total and status mix; add validates numbers; edit (PATCH) and delete', async () => {
    setup('cad-parts');
    expect(await screen.findByText('Omni wheel')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Parts by status' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Add part/ })[0]);
    fireEvent.change(await screen.findByLabelText('Part name'), { target: { value: 'Bearing' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '0' } });
    fireEvent.submit(document.getElementById('bom-form')!);
    expect(dialog.notify).toHaveBeenCalledWith('Quantity must be a whole number, 1 or more.', 'error');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Unit cost ($)'), { target: { value: '1.25' } });
    fireEvent.submit(document.getElementById('bom-form')!);
    await waitFor(() => expect(calls('/api/cad/parts', 'POST')).toHaveLength(1));
    expect(JSON.parse(calls('/api/cad/parts', 'POST')[0][1].body)).toMatchObject({ name: 'Bearing', quantity: 8, unit_cost: 1.25, section: 'Intake', source: 'purchased', status: 'to_order' });
    await waitFor(() => expect(screen.queryByLabelText('Part name')).not.toBeInTheDocument());
    await menu('Actions for Servo', /Edit part/);
    expect(await screen.findByLabelText('Part name')).toHaveValue('Servo');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(calls('/api/cad/parts/22', 'PATCH')).toHaveLength(1));
    expect(JSON.parse(calls('/api/cad/parts/22', 'PATCH')[0][1].body)).toMatchObject({ quantity: 3 });
    await menu('Actions for Omni wheel', /Delete/);
    await waitFor(() => expect(calls('/api/cad/parts/21', 'DELETE')).toHaveLength(1));
  });

  it('invoice import: parse → untick → import the selected rows', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/cad/parts/import-invoice/parse') return json({ items: [{ name: 'Bolt pack', quantity: 2, unitPrice: 5, sku: 'B1' }, { name: 'Wheel', quantity: 4, unitPrice: 12 }] });
      return init?.method ? json({ id: 1 }) : json(db[url] ?? []);
    });
    setup('cad-parts');
    fireEvent.click(await screen.findByRole('button', { name: /Import invoice/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Choose invoice files/), { target: { files: [new File(['x'], 'order.pdf')] } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Parse with Bruno/ }));
    expect(await within(dlg).findByLabelText('Name for row 1')).toHaveValue('Bolt pack');
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Import Wheel' }));
    fireEvent.click(within(dlg).getByRole('button', { name: /Import selected \(1\)/ }));
    await waitFor(() => expect(calls('/api/cad/parts', 'POST')).toHaveLength(1));
    expect(JSON.parse(calls('/api/cad/parts', 'POST')[0][1].body)).toMatchObject({ name: 'Bolt pack', quantity: 2, unit_cost: 5, notes: 'SKU: B1' });
    expect(dialog.notify).toHaveBeenCalledWith('Imported 1 part into the BOM.', 'success');
  });

  it('a part save that finishes after leaving still refreshes the page you came back to', async () => {
    let finish: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/cad/parts' && init?.method === 'POST') return new Promise((r) => { finish = r; });
      return init?.method ? json({}) : json(db[url] ?? []);
    });
    const first = setup('cad-parts');
    fireEvent.click(await screen.findByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText('Part name'), { target: { value: 'Late part' } });
    fireEvent.submit(document.getElementById('bom-form')!);
    first.unmount();
    setup('cad-parts');
    expect(await screen.findByRole('button', { name: /Saving…/ })).toBeDisabled();
    db['/api/cad/parts'] = [...db['/api/cad/parts'], { id: 23, name: 'Late part', section: 'Intake', quantity: 1, source: 'purchased', unit_cost: 0, status: 'to_order' }];
    await act(async () => { finish({ ok: true, json: async () => ({ id: 23 }) }); });
    expect(await screen.findByText('Late part')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('Part name')).not.toBeInTheDocument());
  });

  it('cancelling an invoice read drops it: the late reply never brings rows back', async () => {
    let reply: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/cad/parts/import-invoice/parse') return new Promise((r) => { reply = r; });
      return init?.method ? json({ id: 1 }) : json(db[url] ?? []);
    });
    setup('cad-parts');
    fireEvent.click(await screen.findByRole('button', { name: /Import invoice/ }));
    let dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Choose invoice files/), { target: { files: [new File(['x'], 'order.pdf')] } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Parse with Bruno/ }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(async () => { reply({ ok: true, json: async () => ({ items: [{ name: 'Stale row', quantity: 1, unitPrice: 1 }] }) }); });
    fireEvent.click(screen.getByRole('button', { name: /Import invoice/ }));
    dlg = await screen.findByRole('dialog');
    expect(within(dlg).queryByDisplayValue('Stale row')).not.toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: /Parse with Bruno/ })).toBeInTheDocument();
  });

  it('cancelling a multi-file read sends no further files', async () => {
    let reply: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/cad/parts/import-invoice/parse') return new Promise((r) => { reply = r; });
      return init?.method ? json({ id: 1 }) : json(db[url] ?? []);
    });
    setup('cad-parts');
    fireEvent.click(await screen.findByRole('button', { name: /Import invoice/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText(/Choose invoice files/), { target: { files: [new File(['x'], 'a.pdf'), new File(['y'], 'b.pdf'), new File(['z'], 'c.pdf')] } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Parse with Bruno/ }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await act(async () => { reply({ ok: true, json: async () => ({ items: [{ name: 'Row', quantity: 1, unitPrice: 1 }] }) }); });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls('/api/cad/parts/import-invoice/parse', 'POST')).toHaveLength(1);
  });

  it('cancelling or failing a review delete keeps its sheet open', async () => {
    setup('cad-reviews', true);
    fireEvent.click(await screen.findByRole('button', { name: /Lift v2/ }));
    const sheet = await screen.findByRole('dialog');
    dialog.confirmDialog.mockResolvedValueOnce(false);
    fireEvent.click(within(sheet).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    api.apiFetch.mockImplementation((url: string, init?: any) => (init?.method === 'DELETE' ? json({}, false) : json(db[url] ?? [])));
    fireEvent.click(within(sheet).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Could not delete.', 'error'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a status change or delete refreshes every mounted CAD page', async () => {
    setup('cad-reviews', true);
    fireEvent.click(await screen.findByRole('button', { name: /Lift v2/ }));
    const before = calls('/api/cad/reviews').length;
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(calls('/api/cad/reviews').length).toBeGreaterThan(before));
  });

  it("a part save finishing after you opened another part doesn't close the other editor", async () => {
    let finish: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/cad/parts' && init?.method === 'POST') return new Promise((r) => { finish = r; });
      return init?.method ? json({}) : json(db[url] ?? []);
    });
    setup('cad-parts');
    fireEvent.click(await screen.findByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText('Part name'), { target: { value: 'New one' } });
    fireEvent.submit(document.getElementById('bom-form')!);
    // As Legacy allows: close mid-save and open another part.
    act(() => setDraft('cad:part-open', db['/api/cad/parts'][0]));
    expect(await screen.findByDisplayValue('Omni wheel')).toBeInTheDocument();
    await act(async () => { finish({ ok: true, json: async () => ({ id: 9 }) }); });
    expect(screen.getByDisplayValue('Omni wheel')).toBeInTheDocument();
  });
});

