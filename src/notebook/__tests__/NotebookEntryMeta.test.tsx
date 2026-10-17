import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
import { NotebookEntryMeta, entryMetaSettled } from '../NotebookEntryMeta';

afterEach(() => { cleanup(); api.apiJson.mockReset(); });

const base = {
  meta: { workDate: '2026-10-15', type: 'test', stage: null, subsystems: ['Intake'], awards: ['think'] },
  readMinutes: 3, writtenBy: ['Ana', 'Lee'], lastEditedBy: 'Lee', createdAt: '2026-10-16T12:00:00Z',
  teamSubsystems: ['Drivetrain', 'Intake'], canEdit: true,
};

describe('Notebook entry details', () => {
  it('exports can wait for pending saves, and learn when one failed', async () => {
    let fail = false;
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') { if (fail) throw new Error('nope'); return { meta: { ...base.meta, stage: 'iterate' } }; }
      return base;
    });
    render(<NotebookEntryMeta pageId={9} teamId={1} revision={2} />);
    fireEvent.change(await screen.findByLabelText('Design stage'), { target: { value: 'iterate' } });
    expect(await entryMetaSettled(9)).toBe(true);
    fail = true;
    fireEvent.change(screen.getByLabelText('Entry type'), { target: { value: 'build' } });
    expect(await entryMetaSettled(9)).toBe(false);
  });


  it('shows the details, byline and read time; awards explain what judges look for', async () => {
    api.apiJson.mockResolvedValue(base);
    render(<NotebookEntryMeta pageId={5} teamId={1} revision={2} />);
    expect(await screen.findByText(/Written by Ana, Lee/)).toBeInTheDocument();
    expect(screen.getByText(/last edited by Lee/)).toBeInTheDocument();
    expect(screen.getByText('3 min read')).toBeInTheDocument();
    expect((screen.getByLabelText('Entry type') as HTMLSelectElement).value).toBe('test');
    expect((screen.getByLabelText('Work happened on') as HTMLInputElement).value).toBe('2026-10-15');
    expect(screen.getByText('Think').closest('span')?.getAttribute('title')).toMatch(/engineering notebook/);
  });

  it('saves one field at a time and rolls back on an error', async () => {
    // Like the server: a saved change is what the next read returns.
    let saved: any = base;
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.stage === 'iterate') { saved = { ...saved, meta: { ...saved.meta, stage: 'iterate' } }; return { meta: saved.meta }; }
        throw new Error("Subsystems must be on the team's list");
      }
      return saved;
    });
    render(<NotebookEntryMeta pageId={5} teamId={1} revision={2} />);
    fireEvent.change(await screen.findByLabelText('Design stage'), { target: { value: 'iterate' } });
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/notebook/pages/5/meta', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ stage: 'iterate' }) })));
    expect((screen.getByLabelText('Design stage') as HTMLSelectElement).value).toBe('iterate');
    // Chips are sent as relative changes.
    fireEvent.click(screen.getByRole('button', { name: 'Remove subsystem Intake' }));
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/notebook/pages/5/meta', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ subsystemsRemove: ['Intake'] }) })));
    expect(await screen.findByRole('alert')).toHaveTextContent(/team's list/);
    expect(screen.getByText('Intake')).toBeInTheDocument();
  });

  it('a reload that started before a save never overwrites it', async () => {
    let releaseGet: (v: any) => void = () => {};
    let gets = 0;
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') return { meta: { ...base.meta, type: 'build' } };
      gets++;
      if (gets === 2) return new Promise((r) => { releaseGet = r; }); // a slow refresh
      return gets > 2 ? { ...base, meta: { ...base.meta, type: 'build' } } : base;
    });
    render(<NotebookEntryMeta pageId={5} teamId={1} revision={2} />);
    await screen.findByLabelText('Entry type');
    window.dispatchEvent(new Event('focus')); // starts the slow refresh
    await waitFor(() => expect(gets).toBe(2));
    fireEvent.change(screen.getByLabelText('Entry type'), { target: { value: 'build' } });
    await waitFor(() => expect(gets).toBe(3));
    releaseGet(base); // the old answer arrives last
    await new Promise((r) => setTimeout(r, 20));
    expect((screen.getByLabelText('Entry type') as HTMLSelectElement).value).toBe('build');
  });

  it('read-only for members who can\'t edit the notebook', async () => {
    api.apiJson.mockResolvedValue({ ...base, canEdit: false });
    render(<NotebookEntryMeta pageId={5} />);
    expect(await screen.findByLabelText('Entry type')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Remove subsystem/ })).toBeNull();
    expect(screen.queryByLabelText('Add award')).toBeNull();
  });
});
