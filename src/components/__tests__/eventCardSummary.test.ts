import { describe, it, expect } from 'vitest';
import { itemSummary } from '../ActionProposalCard';

describe("Bruno's event card", () => {
  it('shows type, place and the agenda itself, so it can be checked before saving', () => {
    expect(itemSummary('event', { title: 'Scrimmage at Lincoln', date: '2099-05-02', time: '09:00', type: 'scrimmage', location: 'Lincoln HS gym', agenda: 'Inspection\nMatches\n' }))
      .toBe('Scrimmage at Lincoln — 2099-05-02 at 09:00 @ Lincoln HS gym · Scrimmage · Agenda: Inspection; Matches');
  });
});
