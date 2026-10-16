// Bruno's tag suggestions in the editor: a late reply never lands on another
// task, labels stop at the limit, and a tag the member re-picks is theirs.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { useTagSuggest, type TagLists } from '../pages/tasks/TaskTagSuggest';

type Form = { title: string; description: string } & TagLists;
const reply = (d: any) => ({ ok: true, json: async () => d });

function harness(initial: Form) {
  const form = { current: initial };
  const hook = renderHook(() => useTagSuggest(() => form.current, (next) => { form.current = { ...form.current, ...next }; }));
  return { form, hook };
}

beforeEach(() => { api.apiFetch.mockReset(); });

describe('useTagSuggest', () => {
  it("a reply that lands after the editor moved to another task is dropped", async () => {
    let finish!: (v: any) => void;
    api.apiFetch.mockImplementation(() => new Promise((r) => { finish = r; }));
    const { form, hook } = harness({ title: 'Task A intake', description: '', subsystems: [], awards: [], labels: [] });
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.suggest(); });
    act(() => { hook.result.current.reset(); });
    form.current = { title: 'Task B budget', description: '', subsystems: [], awards: [], labels: [] };
    await act(async () => { finish(reply({ subsystems: ['Intake'], awards: ['think'], labels: [], reason: 'A' })); await pending; });
    expect(form.current.subsystems).toEqual([]);
    expect(form.current.awards).toEqual([]);
    expect(hook.result.current.added).toBeNull();
    expect(hook.result.current.busy).toBe(false);
  });

  it('labels stop at ten; only what was added is marked', async () => {
    api.apiFetch.mockResolvedValue(reply({ subsystems: [], awards: [], labels: ['CAD', 'Prototype'], reason: '' }));
    const nine = Array.from({ length: 9 }, (_, i) => `L${i}`);
    const { form, hook } = harness({ title: 'Model the claw', description: '', subsystems: [], awards: [], labels: nine });
    await act(async () => { await hook.result.current.suggest(); });
    expect(form.current.labels).toEqual([...nine, 'CAD']);
    expect(hook.result.current.added?.labels).toEqual(['CAD']);
  });

  it("a tag the member removes and picks again is theirs: Undo leaves it", async () => {
    api.apiFetch.mockResolvedValue(reply({ subsystems: ['Intake'], awards: ['think'], labels: [], reason: 'Design work' }));
    const { form, hook } = harness({ title: 'Model the claw', description: '', subsystems: [], awards: [], labels: [] });
    await act(async () => { await hook.result.current.suggest(); });
    // The member unticks Think, then ticks it again.
    act(() => { hook.result.current.touch('awards', []); form.current = { ...form.current, awards: [] }; });
    act(() => { hook.result.current.touch('awards', ['think']); form.current = { ...form.current, awards: ['think'] }; });
    expect(hook.result.current.marked('awards', form.current.awards)).toEqual([]);
    act(() => { hook.result.current.undo(); });
    expect(form.current.awards).toEqual(['think']);
    expect(form.current.subsystems).toEqual([]);
  });
});
