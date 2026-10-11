import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../../services/proposalContext', async (orig) => ({ ...(await orig<object>()), useProposalContext: () => undefined }));
import { resultLinks } from '../resultLinks';
import ActionProposalCard from '../../ActionProposalCard';
import { ProposalCard } from '../../../modern/pages/bruno/BrunoParts';
afterEach(cleanup);

describe('where to see what Bruno just added', () => {
  it('links one new record directly, several to their page', () => {
    expect(resultLinks({ applied: { task: 1 }, created: { task: [42] } })).toEqual([{ label: 'View task', to: '/tasks?task=42' }]);
    expect(resultLinks({ applied: { task: 3 }, created: { task: [1, 2, 3] } })).toEqual([{ label: 'View 3 tasks', to: '/tasks' }]);
    expect(resultLinks({ applied: { event: 1, outreach: 1, communication: 2, budget: 1 }, created: { event: [9] } })).toEqual([
      { label: 'View in calendar', to: '/calendar?event=9' },
      { label: 'View outreach', to: '/outreach' },
      { label: 'View communications', to: '/comm' },
      { label: 'View budget', to: '/budget' },
    ]);
    expect(resultLinks({ applied: { 'delete-event': 2 }, created: {} })).toEqual([{ label: 'Open calendar', to: '/calendar' }]);
    expect(resultLinks({ applied: {}, created: {} })).toEqual([]);
  });

  it('both card designs show the links once applied', () => {
    const proposals = [{ kind: 'task', items: [{ title: 'Finish field' }] }] as any;
    const links = [{ label: 'View task', to: '/tasks?task=42' }];
    render(<MemoryRouter><ActionProposalCard proposals={proposals} status="done" links={links} onConfirm={() => {}} onDismiss={() => {}} /><ProposalCard proposals={proposals} status="done" links={links} onConfirm={() => {}} onDismiss={() => {}} /></MemoryRouter>);
    const found = screen.getAllByRole('link', { name: 'View task' });
    expect(found).toHaveLength(2);
    for (const a of found) expect(a.getAttribute('href')).toBe('/tasks?task=42');
  });
});
