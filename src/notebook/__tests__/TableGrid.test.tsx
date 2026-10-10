import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TableGrid } from '../ribbon/TableGrid';
afterEach(cleanup);

describe('table size picker', () => {
  it('starts at 3 × 3, follows the pointer and inserts on click', () => {
    const onPick = vi.fn();
    render(<TableGrid onPick={onPick} />);
    expect(screen.getByText('3 × 3 table')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole('button', { name: '2 by 5 table' }));
    expect(screen.getByText('2 × 5 table')).toBeTruthy();
    expect(document.querySelectorAll('[data-on]')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: '2 by 5 table' }));
    expect(onPick).toHaveBeenCalledWith(2, 5);
  });

  it('grows and shrinks with arrow keys inside its bounds, and Enter inserts', () => {
    const onPick = vi.fn();
    render(<TableGrid onPick={onPick} />);
    const grid = screen.getByRole('group', { name: /Table size/ });
    for (let i = 0; i < 10; i++) fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' }); fireEvent.keyDown(grid, { key: 'ArrowUp' }); fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(screen.getByText('1 × 8 table')).toBeTruthy();
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(1, 8);
  });
});
