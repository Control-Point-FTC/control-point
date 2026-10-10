import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NotebookBreadcrumbs, pageTrail, usePageHistory } from '../NotebookBreadcrumbs';
import type { NotebookPageItem, NotebookTree } from '../types';
afterEach(cleanup);

const page = (id: number, parentId: number | null = null, title = `Page ${id}`): NotebookPageItem => ({ id, sectionId: 10, parentId, title, sort: id, protected: false, ownProtected: false, revision: 1, updatedAt: '' });
const tree = (pages: NotebookPageItem[]): NotebookTree => ({
  notebooks: [{ id: 1, title: 'Robot notebook', color: null, sort: 0 }],
  sections: [{ id: 10, notebookId: 1, title: 'Drivetrain', color: null, sort: 0, protected: false, defaultTemplate: null, dateStamp: false }],
  pages, permissions: { read: true, edit: true, organize: true, delete: true, protect: false },
});

describe('breadcrumbs', () => {
  it('shows notebook › section › parent pages › page, and opens a parent page', () => {
    const onOpen = vi.fn();
    const t = tree([page(1), page(2, 1, 'Gearbox'), page(3, 2, 'Ratios')]);
    render(<NotebookBreadcrumbs trail={pageTrail(t, 3)} canBack={false} canForward onBack={vi.fn()} onForward={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByRole('navigation', { name: 'Page location' }).textContent).toBe('Robot notebookDrivetrainPage 1GearboxRatios');
    expect(screen.getByText('Ratios').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Gearbox' }));
    expect(onOpen).toHaveBeenCalledWith(2);
    expect((screen.getByRole('button', { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Forward/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('stops at hidden parents and parent cycles', () => {
    expect(pageTrail(tree([page(3, 99)]), 3).ancestors).toEqual([]);
    const cyclic = tree([{ ...page(1), parentId: 2 }, page(2, 1)]);
    expect(pageTrail(cyclic, 1).ancestors.map(p => p.id)).toEqual([2]);
    expect(pageTrail(tree([]), 5).page).toBeUndefined();
  });
});

describe('back and forward', () => {
  it('walks pages opened in this visit, skips deleted ones, and starts a new branch after going back', async () => {
    const pages = new Set([1, 2, 3, 4]);
    const open = vi.fn(async (_id: number) => true);
    const { result, rerender } = renderHook(({ selected }) => usePageHistory(selected, id => pages.has(id), open), { initialProps: { selected: 1 as number | null } });
    rerender({ selected: 2 }); rerender({ selected: 3 });
    expect(result.current.canBack).toBe(true); expect(result.current.canForward).toBe(false);
    pages.delete(2);
    await act(async () => { await result.current.back(); });
    expect(open).toHaveBeenLastCalledWith(1);
    rerender({ selected: 1 });
    expect(result.current.canBack).toBe(false); expect(result.current.canForward).toBe(true);
    await act(async () => { await result.current.forward(); });
    expect(open).toHaveBeenLastCalledWith(3);
    rerender({ selected: 3 });
    await act(async () => { await result.current.back(); }); rerender({ selected: 1 });
    rerender({ selected: 4 }); // A new page after going back drops the forward pages.
    expect(result.current.canForward).toBe(false);
  });

  it('stays put when leaving the page was cancelled', async () => {
    const open = vi.fn(async () => false);
    const { result, rerender } = renderHook(({ selected }) => usePageHistory(selected, () => true, open), { initialProps: { selected: 1 as number | null } });
    rerender({ selected: 2 });
    await act(async () => { await result.current.back(); });
    expect(open).toHaveBeenCalledWith(1);
    expect(result.current.canBack).toBe(true);
    expect(result.current.canForward).toBe(false);
  });

  it('takes one move at a time while the page is being left', async () => {
    let finish!: (ok: boolean) => void;
    const open = vi.fn(() => new Promise<boolean>(r => { finish = r; }));
    const { result, rerender } = renderHook(({ selected }) => usePageHistory(selected, () => true, open), { initialProps: { selected: 1 as number | null } });
    rerender({ selected: 2 }); rerender({ selected: 3 });
    let first!: Promise<void>;
    act(() => { first = result.current.back(); });
    expect(result.current.canBack).toBe(false);
    await act(async () => { await result.current.back(); }); // Ignored while the first is pending.
    expect(open).toHaveBeenCalledTimes(1);
    await act(async () => { finish(false); await first; });
    // Cancelled: still on page 3, with Back to page 2 available.
    expect(result.current.canBack).toBe(true); expect(result.current.canForward).toBe(false);
    act(() => { void result.current.back(); });
    expect(open).toHaveBeenLastCalledWith(2);
    await act(async () => { finish(true); });
  });
});
