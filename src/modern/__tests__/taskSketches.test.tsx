// The task sheet's sketchpad: draw a stroke, undo it, draw again and save; the
// author can edit and remove their sketch, other members only look.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn(async () => true) }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { TaskSketches } from '../pages/tasks/TaskSketches';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) }); });

const members = [{ id: 7, name: 'Ada' }, { id: 8, name: 'Grace' }];
const sketch = { id: 3, member_id: 7, title: 'Roller spacing', strokes: [{ tool: 'pen', color: '#111111', width: 4, points: [[1, 1, 0.5], [40, 40, 0.5]] }], created_at: '2026-10-16T12:00:00Z', updated_at: null };

function draw(board: Element, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(board, { pointerId: 1, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 });
  fireEvent.pointerMove(board, { pointerId: 1, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(board, { pointerId: 1 });
}

describe('TaskSketches', () => {
  it('draw, undo, draw again and save posts the strokes and title', async () => {
    const reload = vi.fn(async () => {});
    render(<TaskSketches taskId={12} sketches={[]} reload={reload} members={members} currentUserId={7} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /New sketch/ }));
    const board = screen.getByRole('img', { name: /Drawing board, 0 strokes/ });
    draw(board, [0, 0], [0, 0]);
    expect(screen.getByRole('img', { name: /Drawing board, 1 stroke$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByRole('img', { name: /Drawing board, 0 strokes/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    draw(board, [0, 0], [0, 0]);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Hub wiring' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save sketch' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/12/sketches', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(api.apiFetch.mock.calls[0][1].body);
    expect(body.title).toBe('Hub wiring');
    expect(body.strokes).toHaveLength(1);
    expect(body.strokes[0]).toMatchObject({ tool: 'pen', color: '#2587db' });
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('a second finger mid-stroke is ignored; Ctrl+Z in the title is the text undo, not the ink undo', () => {
    render(<TaskSketches taskId={12} sketches={[]} reload={vi.fn(async () => {})} members={members} currentUserId={7} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /New sketch/ }));
    const board = screen.getByRole('img', { name: /Drawing board, 0 strokes/ });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(board, { button: 0, pointerId: 2, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(board, { pointerId: 2 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 3, clientY: 3 });
    fireEvent.pointerUp(board, { pointerId: 1 });
    expect(screen.getByRole('img', { name: /Drawing board, 1 stroke$/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText(/Title/), { key: 'z', ctrlKey: true });
    expect(screen.getByRole('img', { name: /Drawing board, 1 stroke$/ })).toBeTruthy();
    fireEvent.keyDown(board, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('img', { name: /Drawing board, 0 strokes/ })).toBeTruthy();
  });

  it("an open sketch follows a teammate's edit and closes when it's removed", () => {
    const props = { taskId: 12, reload: vi.fn(async () => {}), members, currentUserId: 8, canModerate: false };
    const { rerender } = render(<TaskSketches {...props} sketches={[sketch as any]} />);
    fireEvent.click(screen.getByRole('button', { name: /Roller spacing/ }));
    expect(screen.getByRole('heading', { name: 'Roller spacing' })).toBeTruthy();
    rerender(<TaskSketches {...props} sketches={[{ ...sketch, title: 'Roller spacing v2' } as any]} />);
    expect(screen.getByRole('heading', { name: 'Roller spacing v2' })).toBeTruthy();
    rerender(<TaskSketches {...props} sketches={[]} />);
    expect(screen.queryByRole('heading', { name: /Roller spacing/ })).toBeNull();
  });

  it('a sketch at the size limit says so and takes no more strokes (the server would refuse it)', () => {
    const big = { ...sketch, strokes: Array.from({ length: 600 }, () => sketch.strokes[0]) };
    render(<TaskSketches taskId={12} sketches={[big as any]} reload={vi.fn(async () => {})} members={members} currentUserId={7} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Roller spacing/ }));
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(screen.getByText(/as big as one can be/)).toBeTruthy();
    draw(screen.getByRole('img', { name: /Drawing board/ }), [0, 0], [0, 0]);
    expect(screen.getByRole('img', { name: /Drawing board, 600 strokes/ })).toBeTruthy();
  });

  it('a dropped connection on save keeps the drawing open and says so', async () => {
    api.apiFetch.mockRejectedValue(new Error('offline'));
    render(<TaskSketches taskId={12} sketches={[]} reload={vi.fn(async () => {})} members={members} currentUserId={7} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /New sketch/ }));
    draw(screen.getByRole('img', { name: /Drawing board/ }), [0, 0], [0, 0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save sketch' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith(expect.stringMatching(/check your connection/), 'error'));
    expect(screen.getByRole('img', { name: /Drawing board, 1 stroke$/ })).toBeTruthy();
  });

  it('the author can edit or remove; someone else only views', async () => {
    const reload = vi.fn(async () => {});
    const { unmount } = render(<TaskSketches taskId={12} sketches={[sketch as any]} reload={reload} members={members} currentUserId={8} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Roller spacing/ }));
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    unmount();
    render(<TaskSketches taskId={12} sketches={[sketch as any]} reload={reload} members={members} currentUserId={7} canModerate={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Roller spacing/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/12/sketches/3', { method: 'DELETE' }));
  });
});
