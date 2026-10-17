import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clampPaneWidth, NotebookPaneResizer, PAGES_MAX_WIDTH, PAGES_MIN_WIDTH, PAGES_WIDTH_KEY, usePagesPaneWidth } from '../NotebookPaneResizer';

function Harness() {
  const pane = useRef<HTMLElement | null>(null);
  const [width, setWidth] = usePagesPaneWidth();
  return (
    <div>
      <aside ref={pane} data-testid="pane" style={width ? { width } : undefined} />
      <NotebookPaneResizer paneRef={pane} width={width} onWidth={setWidth} />
    </div>
  );
}

describe('notebook pages pane resizer', () => {
  beforeEach(() => window.localStorage.removeItem(PAGES_WIDTH_KEY));
  afterEach(cleanup);

  it('keeps widths between the minimum and the cap (or half the window)', () => {
    expect(clampPaneWidth(20, 1600)).toBe(PAGES_MIN_WIDTH);
    expect(clampPaneWidth(5000, 1600)).toBe(PAGES_MAX_WIDTH);
    expect(clampPaneWidth(700, 1000)).toBe(500);
    expect(clampPaneWidth(333.4, 1600)).toBe(333);
  });

  it('dragging the divider resizes the pane and remembers the width', () => {
    render(<Harness />);
    const sep = screen.getByRole('separator', { name: /resize pages list/i });
    fireEvent.keyDown(sep, { key: 'ArrowRight' }); // from the 300px fallback
    expect(screen.getByTestId('pane').style.width).toBe('316px');
    fireEvent.pointerDown(sep, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(sep, { clientX: 460, pointerId: 1 });
    fireEvent.pointerUp(sep, { clientX: 460, pointerId: 1 });
    expect(screen.getByTestId('pane').style.width).toBe('376px');
    expect(window.localStorage.getItem(PAGES_WIDTH_KEY)).toBe('376');
  });

  it('double-click puts the default width back', () => {
    window.localStorage.setItem(PAGES_WIDTH_KEY, '420');
    render(<Harness />);
    expect(screen.getByTestId('pane').style.width).toBe('420px');
    fireEvent.doubleClick(screen.getByRole('separator'));
    expect(screen.getByTestId('pane').style.width).toBe('');
    expect(window.localStorage.getItem(PAGES_WIDTH_KEY)).toBeNull();
  });
});
