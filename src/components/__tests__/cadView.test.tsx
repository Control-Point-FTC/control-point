// Legacy CadView now runs on the shared useCad hooks: a smoke test that its
// screens still load, submit and share drafts with Modern.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { CadView } from '../CadView';
import { clearDrafts, getDraft } from '../../modern/drafts';

const json = (body: any) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const DB: Record<string, any> = {
  '/api/cad/parts': [{ id: 21, name: 'Omni wheel', section: 'Drivetrain', quantity: 4, source: 'gobilda', unit_cost: 10, status: 'installed', assignee: '' }],
  '/api/cad/reviews': [{ id: 5, title: 'Intake v3', section: 'Intake', status: 'concept', created_by: 7, created_at: '2026-09-01' }],
};

beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => json(init?.method ? { id: 1 } : DB[url] ?? []));
  dialog.notify.mockReset();
  clearDrafts();
});
afterEach(cleanup);

const view = (tab: string) => render(<MemoryRouter><CadView activeTab={tab} currentUser={{ id: 7 }} isAdmin={false} /></MemoryRouter>);

describe('Legacy CadView on the shared hooks', () => {
  it('parts: lists the BOM and adds a part', async () => {
    view('cad-parts');
    expect(await screen.findByText('Omni wheel')).toBeInTheDocument();
    expect(screen.getAllByText('$40.00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Add Part/ }));
    fireEvent.change(screen.getByPlaceholderText('goBILDA 96mm omni wheel'), { target: { value: 'Bearing' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Add Part/ }).at(-1)!);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/cad/parts', expect.objectContaining({ method: 'POST' })));
  });

  it('reviews: the submit form writes the same draft Modern reads', async () => {
    view('cad-reviews');
    expect(await screen.findByText('Intake v3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Submit Design/ }));
    fireEvent.change(screen.getByPlaceholderText('Intake v3 — dual roller'), { target: { value: 'Climber' } });
    expect(getDraft<any>('cad:review-form', null)?.title).toBe('Climber');
  });
});
