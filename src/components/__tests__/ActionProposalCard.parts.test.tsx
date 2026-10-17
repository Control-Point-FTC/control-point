import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ActionProposalCard, { itemSummary } from '../ActionProposalCard';
import { extractActionProposals, stripEventBlocks } from '../../services/aiService';

describe('Bruno parts card', () => {
  it('reads a parts block and hides it from the chat', () => {
    const text = 'Adding it.\n```parts\n[{"name":"Rhino wheel","quantity":4,"section":"Drivetrain"}]\n```';
    expect(extractActionProposals(text)).toEqual([{ kind: 'part', items: [{ name: 'Rhino wheel', quantity: 4, section: 'Drivetrain' }] }]);
    expect(stripEventBlocks(text)).toBe('Adding it.');
  });

  it('the card shows everything that will be saved', () => {
    const item = { name: 'Rhino wheel', quantity: 4, section: 'Drivetrain', source: 'gobilda', status: 'installed', unit_cost: 12.99, assignee: 'Sam', notes: 'https://www.gobilda.com/rhino' };
    expect(itemSummary('part', item)).toBe('4× Rhino wheel · Drivetrain · gobilda · installed · $12.99 each · for Sam · https://www.gobilda.com/rhino');
    expect(itemSummary('part', { name: 'Bolt' })).toBe('1× Bolt · to order · no price');
    render(<ActionProposalCard proposals={[{ kind: 'part', items: [item] } as any]} status="pending" onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/CAD parts list/)).toBeInTheDocument();
    expect(screen.getByText(/4× Rhino wheel · Drivetrain · gobilda · installed · \$12\.99 each/)).toBeInTheDocument();
  });
});
