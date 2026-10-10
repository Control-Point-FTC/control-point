import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_PENS, PenPresets, readPens } from '../PenPresets';
import { stepStacking, stepStackingInLayers } from '../canvasGeometry';
afterEach(() => { cleanup(); localStorage.clear(); });

describe('favorite pens', () => {
  it('picks a pen, saves the current one once, and removes pens', () => {
    const onPick = vi.fn();
    const view = render(<PenPresets storageKey="pens" current={{ tool: 'pen', color: '#16a34a', size: 6 }} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pen #2563eb, medium' }));
    expect(onPick).toHaveBeenCalledWith(DEFAULT_PENS[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save pen' }));
    expect(readPens('pens')).toHaveLength(5);
    expect((screen.getByRole('button', { name: 'Save pen' }) as HTMLButtonElement).disabled).toBe(true); // already saved
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pen #111111, fine' }));
    expect(readPens('pens').map(p => p.color)).not.toContain('#111111');
    view.rerender(<PenPresets storageKey="pens" current={{ tool: 'eraser', color: '#111111', size: 3 }} onPick={onPick} />);
    expect((screen.getByRole('button', { name: 'Save pen' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps two open ribbons in step (split view)', () => {
    const current = { tool: 'pen', color: '#16a34a', size: 6 };
    render(<><div data-testid="a"><PenPresets storageKey="pens-split" current={current} onPick={vi.fn()} /></div><div data-testid="b"><PenPresets storageKey="pens-split" current={current} onPick={vi.fn()} /></div></>);
    const [saveA] = screen.getAllByRole('button', { name: 'Save pen' });
    fireEvent.click(saveA);
    const removeInB = within(screen.getByTestId('b')).getByRole('button', { name: 'Remove Pen #111111, fine' });
    fireEvent.click(removeInB);
    const saved = readPens('pens-split');
    expect(saved.map(p => p.color)).toContain('#16a34a');
    expect(saved.map(p => p.color)).not.toContain('#111111');
    expect(within(screen.getByTestId('a')).queryByRole('button', { name: 'Remove Pen #111111, fine' })).toBeNull();
  });

  it('keeps editing in memory when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    render(<PenPresets storageKey="nostore" current={{ tool: 'pen', color: '#16a34a', size: 6 }} onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save pen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pen #111111, fine' }));
    expect(screen.getByRole('button', { name: 'Pen #16a34a, thick' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pen #111111, fine' })).toBeNull();
    setItem.mockRestore();
  });

  it("picks up another tab's changes even while Draw was closed", () => {
    const view = render(<PenPresets storageKey="pens-tabs" current={{ tool: 'pen', color: '#16a34a', size: 6 }} onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save pen' }));
    view.unmount();
    const other = [{ tool: 'pen', color: '#000000', size: 2 }];
    localStorage.setItem('pens-tabs', JSON.stringify(other));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pens-tabs' }));
    expect(readPens('pens-tabs')).toEqual(other);
  });

  it('ignores damaged stored pens', () => {
    localStorage.setItem('damaged', JSON.stringify([{ tool: 'pen', color: 'red', size: 3 }, { tool: 'pen', color: '#000000', size: 2 }]));
    expect(readPens('damaged')).toEqual([{ tool: 'pen', color: '#000000', size: 2 }]);
    localStorage.setItem('broken', '{oops');
    expect(readPens('broken')).toEqual(DEFAULT_PENS);
  });
});

describe('bring forward / send backward', () => {
  it('moves chosen items one step and keeps a chosen group together', () => {
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['b']), 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['c']), -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['b', 'c']), 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(stepStacking(['a', 'b'], new Set(['b']), 1)).toEqual(['a', 'b']);
    // Highlighters are drawn in their own layer: pen A passes pen B, not highlighter H.
    const layer = (id: string) => id.startsWith('h') ? 'highlights' : 'page';
    expect(stepStackingInLayers(['pA', 'h1', 'pB'], new Set(['pA']), 1, layer)).toEqual(['pB', 'h1', 'pA']);
    expect(stepStackingInLayers(['h1', 'pA', 'h2'], new Set(['h1']), 1, layer)).toEqual(['h2', 'pA', 'h1']);
  });
});
