// A failed priority change (board drag) undoes only itself: an update that
// arrived meanwhile is kept.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { useTasksController } from '../../components/tasks/useTasksController';

describe('setPriority', () => {
  it('rolls back only this task, and keeps a newer change', async () => {
    let state: any[] = [{ id: 1, title: 'A', priority: null, status: 'todo' }, { id: 2, title: 'B', priority: null, status: 'todo' }];
    const setTasks = (v: any) => { state = typeof v === 'function' ? v(state) : v; };
    let fail!: () => void;
    api.apiFetch.mockImplementation(() => new Promise((r) => { fail = () => r({ ok: false }); }));
    const { result } = renderHook(() => useTasksController({
      tasks: state, setTasks, teams: [{ id: 1, name: 'T' }], members: [], refresh: { tasks: vi.fn() },
      currentUser: { id: 9, team_id: 1, account_type: 'admin' }, hasScope: () => true,
    } as any));
    let pending!: Promise<void>;
    act(() => { pending = result.current.setPriority(1, 'high'); });
    expect(state.find((t) => t.id === 1).priority).toBe('high');
    // A live update for another task lands while the request is out.
    setTasks((ts: any[]) => ts.map((t) => (t.id === 2 ? { ...t, priority: 'urgent' } : t)));
    await act(async () => { fail(); await pending; });
    expect(state.find((t) => t.id === 1).priority).toBeNull();
    expect(state.find((t) => t.id === 2).priority).toBe('urgent');
  });
});
