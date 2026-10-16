// The task sheet's timeline never shows another task's discussion: a slow
// reply for a task you've already left is dropped.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { useTaskTimeline } from '../pages/tasks/TaskTimeline';

const reply = (taskId: number) => ({ ok: true, json: async () => ({ comments: [{ id: taskId, body: `about task ${taskId}` }], activity: [], watchers: [], watching: false }) });

describe('useTaskTimeline', () => {
  it('drops a late reply for the previous task', async () => {
    let releaseA!: () => void;
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/tasks/1/timeline') return new Promise((r) => { releaseA = () => r(reply(1)); });
      return Promise.resolve(reply(2));
    });
    const { result, rerender } = renderHook(({ id }) => useTaskTimeline(id, ''), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data?.comments[0].body).toBe('about task 2'));
    // Task 1's reply arrives last: it must not replace task 2's timeline.
    await act(async () => { releaseA(); await Promise.resolve(); });
    expect(result.current.data?.comments[0].body).toBe('about task 2');
  });
});
