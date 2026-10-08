import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveProposals, setProposalContext } from '../proposalContext';
import { itemSummary } from '../../components/ActionProposalCard';

afterEach(() => setProposalContext(null));
const task = { title: 'Test autonomous paths', description: 'High priority task (Assigned to Arnav). Due at 4:30pm.', due_date: '2026-10-15' };

describe('confirm card = what is saved', () => {
  it('with the team context, the card and the sent items carry the same resolved fields', () => {
    setProposalContext({ today: '2026-10-08', roster: ['Arnav Patel', 'Ada Lovelace'] });
    const [p] = resolveProposals([{ kind: 'task', items: [task] }]);
    expect(p.items[0]).toMatchObject({ due_date: '2026-10-15', due_time: '16:30', priority: 'high', assignees: ['Arnav Patel'] });
    expect(itemSummary('task', task)).toBe('Test autonomous paths — due 2026-10-15 at 16:30 · high priority · → Arnav Patel');
  });

  it('without it, both show and send only the explicit fields', () => {
    const [p] = resolveProposals([{ kind: 'task', items: [task] }]);
    expect(p.items[0]).toMatchObject({ due_time: null, priority: null, assignees: [] });
    expect(itemSummary('task', task)).toBe('Test autonomous paths — due 2026-10-15');
  });

  it('an event shown as timed is sent timed; without context it stays all day', () => {
    const ev = { title: 'Build session', notes: 'From 3-5pm in the shop', date: '2026-10-10' };
    expect(itemSummary('event', ev)).toBe('Build session — 2026-10-10 (all day)');
    expect(resolveProposals([{ kind: 'event', items: [ev] }])[0].items[0]).toEqual(ev);
    setProposalContext({ today: '2026-10-08', roster: [] });
    expect(itemSummary('event', ev)).toBe('Build session — 2026-10-10 at 15:00–17:00');
    expect(resolveProposals([{ kind: 'event', items: [ev] }])[0].items[0]).toMatchObject({ time: '15:00', end: '17:00', notes: 'in the shop' });
  });
});

describe('context freshness', () => {
  it('a context older than a minute is reloaded before the next card', async () => {
    const api = await import('../api');
    const spy = vi.spyOn(api, 'apiFetch').mockResolvedValue({ ok: true, json: async () => ({ today: '2026-10-09', roster: ['New Member'] }) } as any);
    const { loadProposalContext, getProposalContext } = await import('../proposalContext');
    setProposalContext({ today: '2026-10-08', roster: ['Old'], loadedAt: Date.now() - 61_000 });
    await loadProposalContext();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(getProposalContext()).toMatchObject({ today: '2026-10-09', roster: ['New Member'] });
    await loadProposalContext(); // fresh now: no second fetch
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
