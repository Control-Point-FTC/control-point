import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PENS, PenPresets, readPens } from '../PenPresets';
import { stepStacking } from '../canvasGeometry';
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

  it('ignores damaged stored pens', () => {
    localStorage.setItem('pens', JSON.stringify([{ tool: 'pen', color: 'red', size: 3 }, { tool: 'pen', color: '#000000', size: 2 }]));
    expect(readPens('pens')).toEqual([{ tool: 'pen', color: '#000000', size: 2 }]);
    localStorage.setItem('pens', '{oops');
    expect(readPens('pens')).toEqual(DEFAULT_PENS);
  });
});

describe('bring forward / send backward', () => {
  it('moves chosen items one step and keeps a chosen group together', () => {
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['b']), 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['c']), -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(stepStacking(['a', 'b', 'c', 'd'], new Set(['b', 'c']), 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(stepStacking(['a', 'b'], new Set(['b']), 1)).toEqual(['a', 'b']);
  });
});
