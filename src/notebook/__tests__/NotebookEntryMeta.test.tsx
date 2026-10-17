import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
import { NotebookEntryMeta } from '../NotebookEntryMeta';

afterEach(() => { cleanup(); api.apiJson.mockReset(); });

const base = {
  meta: { workDate: '2026-10-15', type: 'test', stage: null, subsystems: ['Intake'], awards: ['think'] },
  readMinutes: 3, writtenBy: ['Ana', 'Lee'], lastEditedBy: 'Lee', createdAt: '2026-10-16T12:00:00Z',
  teamSubsystems: ['Drivetrain', 'Intake'], canEdit: true,
};

describe('Notebook entry details', () => {
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
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.stage === 'iterate') return { meta: { ...base.meta, stage: 'iterate' } };
        throw new Error('Subsystems must be on the team\'s list');
      }
      return base;
    });
    render(<NotebookEntryMeta pageId={5} teamId={1} revision={2} />);
    fireEvent.change(await screen.findByLabelText('Design stage'), { target: { value: 'iterate' } });
    await waitFor(() => expect(api.apiJson).toHaveBeenCalledWith('/api/notebook/pages/5/meta', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ stage: 'iterate' }) })));
    expect((screen.getByLabelText('Design stage') as HTMLSelectElement).value).toBe('iterate');
    fireEvent.click(screen.getByRole('button', { name: 'Remove subsystem Intake' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/team's list/);
    expect(screen.getByText('Intake')).toBeInTheDocument();
  });

  it('read-only for members who can\'t edit the notebook', async () => {
    api.apiJson.mockResolvedValue({ ...base, canEdit: false });
    render(<NotebookEntryMeta pageId={5} />);
    expect(await screen.findByLabelText('Entry type')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Remove subsystem/ })).toBeNull();
    expect(screen.queryByLabelText('Add award')).toBeNull();
  });
});
