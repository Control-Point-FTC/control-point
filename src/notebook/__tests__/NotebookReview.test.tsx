import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as api from '../../services/api';
import { NotebookReviewBar } from '../NotebookReview';

const pending = { id: 7, pageId: 3, pageTitle: 'Intake log', status: 'pending', requestedBy: 2, requestedByName: 'Ana', requestedAt: '2026-10-17T12:00:00Z', note: '', reviewerName: null, reviewedAt: null, comment: '' };

describe('review bar', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('a reviewer can approve or ask for changes right on the page (phones have no queue)', async () => {
    const calls: [string, string | undefined, any][] = [];
    vi.spyOn(api, 'apiJson').mockImplementation(((url: string, init: any = {}) => {
      calls.push([url, init.method, init.body ? JSON.parse(init.body) : undefined]);
      return Promise.resolve(init.method === 'GET' ? { review: pending, canReview: true, canWithdraw: false } : {});
    }) as any);
    render(<NotebookReviewBar pageId={3} teamId={1} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ask for changes/ }));
    const send = screen.getByRole('button', { name: /Send/ });
    expect(send).toBeDisabled(); // a comment is needed
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change' }), { target: { value: 'Add the raw data' } });
    fireEvent.click(send);
    await waitFor(() => expect(calls.some(([u, m, b]) => u === '/api/notebook/reviews/7' && m === 'PUT' && b?.status === 'changes' && b?.comment === 'Add the raw data')).toBe(true));
    fireEvent.click(await screen.findByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(calls.some(([u, m, b]) => u === '/api/notebook/reviews/7' && m === 'PUT' && b?.status === 'approved')).toBe(true));
  });

  it('a teammate who is not a reviewer sees neither decision buttons nor Withdraw', async () => {
    vi.spyOn(api, 'apiJson').mockResolvedValue({ review: pending, canReview: false, canWithdraw: false } as any);
    render(<NotebookReviewBar pageId={3} teamId={1} />);
    expect(await screen.findByText(/Waiting for review/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve|Ask for changes|Withdraw/ })).toBeNull();
  });
});
