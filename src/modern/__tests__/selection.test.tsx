import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, renderHook, waitFor } from '@testing-library/react';

const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn(async () => true) }));
vi.mock('../../components/dialog', () => dialog);

import { BulkBar, RowCheckbox, SelectAllCheckbox, bulkDelete, runBulk, useSelection } from '../ui/selection';

type Row = { id: number; name: string };
const rows: Row[] = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Row ${id}` }));
const getId = (r: Row) => r.id;

beforeEach(() => { dialog.notify.mockClear(); dialog.confirmDialog.mockClear(); });
afterEach(cleanup);

describe('useSelection', () => {
  it('toggles, selects all, and shift-selects a range', () => {
    const { result } = renderHook(() => useSelection(rows, getId));
    act(() => result.current.toggle(2));
    expect(result.current.ids).toEqual([2]);
    act(() => result.current.toggle(4, true));
    expect(result.current.ids).toEqual([2, 3, 4]);
    expect(result.current.some).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.all).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it('drops rows that leave the list', () => {
    const { result, rerender } = renderHook(({ list }) => useSelection(list, getId), { initialProps: { list: rows } });
    act(() => result.current.set([1, 5]));
    rerender({ list: rows.filter((r) => r.id !== 5) });
    expect(result.current.ids).toEqual([1]);
  });
});

function Harness({ onDelete }: { onDelete: (ids: (string | number)[]) => void }) {
  const sel = useSelection(rows, getId);
  return (
    <div>
      <SelectAllCheckbox sel={sel} label="Select all rows" />
      {rows.map((r) => (
        <div key={r.id} onClick={() => { throw new Error('row opened'); }}>
          <RowCheckbox sel={sel} id={r.id} label={`Select ${r.name}`} />
        </div>
      ))}
      <BulkBar sel={sel} noun="row" actions={[{ label: 'Delete', danger: true, run: (ids) => onDelete(ids) }]} />
    </div>
  );
}

describe('BulkBar', () => {
  it('appears with a count, runs an action on the selection, and clears', async () => {
    const onDelete = vi.fn();
    render(<Harness onDelete={onDelete} />);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Row 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Row 3' }));
    expect(screen.getByRole('toolbar', { name: '2 rows selected' })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    expect(onDelete).toHaveBeenCalledWith([1, 3]);
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('select-all shows a partial state and Esc clears', async () => {
    render(<Harness onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Row 2' }));
    expect(screen.getByRole('checkbox', { name: 'Select all rows' })).toHaveAttribute('data-state', 'indeterminate');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(screen.getByRole('toolbar', { name: '5 rows selected' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });
});

describe('BulkBar menu actions', () => {
  function MenuHarness({ task }: { task: () => Promise<void> }) {
    const sel = useSelection(rows, getId);
    return (
      <div>
        <RowCheckbox sel={sel} id={1} label="Select Row 1" />
        <BulkBar sel={sel} noun="row" actions={[{ label: 'Pick', run: () => false, render: (_ids, busy, exec) => <button disabled={busy} onClick={() => exec(task)}>Pick one</button> }]} />
      </div>
    );
  }
  it('holds the bar busy so a second action cannot overlap the first', async () => {
    let finish = () => {};
    const task = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    render(<MenuHarness task={task} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Row 1' }));
    const pick = screen.getByRole('button', { name: 'Pick one' });
    fireEvent.click(pick);
    fireEvent.click(pick);
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('the padding around a row checkbox selects too (44px phone target)', () => {
    render(<MenuHarness task={async () => {}} />);
    const box = screen.getByRole('checkbox', { name: 'Select Row 1' });
    fireEvent.click(box.parentElement!);
    expect(box).toHaveAttribute('data-state', 'checked');
    fireEvent.click(box);
    expect(box).toHaveAttribute('data-state', 'unchecked');
  });
});

describe('runBulk / bulkDelete', () => {
  it('reports partial failures once', async () => {
    const ok = await runBulk([1, 2, 3], async (id) => id !== 2, { verb: 'Deleted', noun: 'task' });
    expect(ok.sort()).toEqual([1, 3]);
    expect(dialog.notify).toHaveBeenCalledTimes(1);
    expect(dialog.notify).toHaveBeenCalledWith("Deleted 2 tasks; 1 couldn't be changed. Try those again.", 'error');
  });

  it('asks first, and does nothing when cancelled', async () => {
    dialog.confirmDialog.mockResolvedValueOnce(false);
    const req = vi.fn(async () => true);
    expect(await bulkDelete([1, 2], req, { noun: 'item' })).toBe(false);
    expect(req).not.toHaveBeenCalled();
    expect(dialog.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete 2 items?', danger: true }));
  });
});
