import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuProvider, useContextMenu, type CtxMenuItem } from '../ContextMenuProvider';

afterEach(cleanup);

function Harness({ onAction }: { onAction: () => void }) {
  useContextMenu('thing', (el) => {
    if (el.dataset.cmId !== '1') return null;
    return [{ label: 'Do the thing', action: onAction }];
  });
  return (
    <div>
      <button type="button" data-cm-type="thing" data-cm-id="1">right-click me</button>
      <div data-cm-type="thing" data-cm-id="2">no handler result</div>
      <div data-cm-type="other">unregistered type</div>
      <input aria-label="name" defaultValue="x" />
      <a href="https://example.com">a link</a>
      <p>plain paragraph</p>
    </div>
  );
}

function renderHarness(onAction: () => void = vi.fn()) {
  return render(
    <ContextMenuProvider>
      <Harness onAction={onAction} />
    </ContextMenuProvider>,
  );
}

describe('ContextMenuProvider', () => {
  it('shows the custom menu on right-click of a registered element', () => {
    renderHarness();
    fireEvent.contextMenu(screen.getByText('right-click me'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Do the thing' })).toBeInTheDocument();
  });

  it('runs the action and closes on item click', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    renderHarness(onAction);
    fireEvent.contextMenu(screen.getByText('right-click me'));
    await user.click(screen.getByRole('menuitem', { name: 'Do the thing' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves the native menu alone when the handler returns nothing', () => {
    renderHarness();
    const ev = fireEvent.contextMenu(screen.getByText('no handler result'));
    expect(ev).toBe(true); // not preventDefaulted
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves the native menu alone for unregistered types and plain areas', () => {
    renderHarness();
    expect(fireEvent.contextMenu(screen.getByText('unregistered type'))).toBe(true);
    expect(fireEvent.contextMenu(screen.getByText('plain paragraph'))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves native behavior inside inputs and on links', () => {
    renderHarness();
    expect(fireEvent.contextMenu(screen.getByLabelText('name'))).toBe(true);
    expect(fireEvent.contextMenu(screen.getByText('a link'))).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves native behavior when text is selected', () => {
    renderHarness();
    const p = screen.getByText('plain paragraph');
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(fireEvent.contextMenu(p)).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    sel?.removeAllRanges();
  });

  it('closes the menu on Escape', async () => {
    const user = userEvent.setup();
    renderHarness();
    fireEvent.contextMenu(screen.getByText('right-click me'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on outside pointerdown and on scroll', () => {
    renderHarness();
    fireEvent.contextMenu(screen.getByText('right-click me'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('right-click me'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.scroll(document);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the current menu when another context menu is attempted', () => {
    renderHarness();
    fireEvent.contextMenu(screen.getByText('right-click me'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Right-clicking an element whose handler returns nothing: no new menu,
    // and the old one is dismissed.
    fireEvent.contextMenu(screen.getByText('no handler result'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('moves focus into the menu on open and restores it on Escape', async () => {
    const user = userEvent.setup();
    renderHarness();
    const trigger = screen.getByText('right-click me');
    trigger.focus();
    fireEvent.contextMenu(trigger);
    const item = screen.getByRole('menuitem', { name: 'Do the thing' });
    await waitFor(() => expect(item).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('opens via Shift+F10 and the Context Menu key on the focused element', () => {
    renderHarness();
    const trigger = screen.getByText('right-click me');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Do the thing' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'ContextMenu' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('does not open when every action is disabled', () => {
    const DisabledHarness = () => {
      useContextMenu('locked', () => [
        { label: 'Nope', disabled: true, action: () => {} },
      ]);
      return <div data-cm-type="locked">locked</div>;
    };
    render(
      <ContextMenuProvider>
        <DisabledHarness />
      </ContextMenuProvider>,
    );
    const ev = fireEvent.contextMenu(screen.getByText('locked'));
    expect(ev).toBe(true); // native menu preserved
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clamps the menu inside a small viewport', () => {
    const origW = window.innerWidth;
    const origH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 300, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true });
    try {
      renderHarness();
      fireEvent.contextMenu(screen.getByText('right-click me'), { clientX: 290, clientY: 190 });
      const menu = screen.getByRole('menu');
      expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(300 - 240 - 8);
      expect(parseFloat(menu.style.top)).toBeLessThanOrEqual(200 - 8);
      expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(8);
      expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: origW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    }
  });
});

describe('ContextMenuProvider keyboard navigation', () => {
  const calls: string[] = [];

  function MultiHarness() {
    useContextMenu('multi', (): CtxMenuItem[] => [
      { label: 'Alpha', action: () => { calls.push('alpha'); } },
      { separator: true },
      { label: 'Beta', disabled: true, action: () => { calls.push('beta'); } },
      { label: 'Gamma', hint: 'G', action: () => { calls.push('gamma'); } },
    ]);
    return <div data-cm-type="multi">multi</div>;
  }

  function renderMulti() {
    calls.length = 0;
    return render(
      <ContextMenuProvider>
        <MultiHarness />
      </ContextMenuProvider>,
    );
  }

  it('renders separators and marks disabled items', () => {
    renderMulti();
    fireEvent.contextMenu(screen.getByText('multi'));
    expect(screen.getByRole('separator')).toBeInTheDocument();
    const beta = screen.getByRole('menuitem', { name: 'Beta' });
    expect(beta).toHaveAttribute('aria-disabled', 'true');
    expect(beta).toBeDisabled();
    expect(screen.getByText('G')).toBeInTheDocument(); // hint text
  });

  it('moves focus with arrows, skipping disabled items, and wraps', async () => {
    const user = userEvent.setup();
    renderMulti();
    fireEvent.contextMenu(screen.getByText('multi'));
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' });
    const gamma = screen.getByRole('menuitem', { name: 'Gamma' });
    await waitFor(() => expect(alpha).toHaveFocus());

    await user.keyboard('{ArrowDown}'); // skips disabled Beta
    expect(gamma).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // wraps
    expect(alpha).toHaveFocus();
    await user.keyboard('{ArrowUp}'); // wraps backward
    expect(gamma).toHaveFocus();
    await user.keyboard('{Home}');
    expect(alpha).toHaveFocus();
    await user.keyboard('{End}');
    expect(gamma).toHaveFocus();
  });

  it('activates the focused item with Enter and Space', async () => {
    const user = userEvent.setup();
    renderMulti();
    fireEvent.contextMenu(screen.getByText('multi'));
    const gamma = screen.getByRole('menuitem', { name: 'Gamma' });
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(gamma).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(calls).toEqual(['gamma']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    cleanup();
    renderMulti();
    fireEvent.contextMenu(screen.getByText('multi'));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus());
    await user.keyboard(' ');
    expect(calls).toEqual(['alpha']);
  });

  it('never activates a disabled item', async () => {
    const user = userEvent.setup();
    renderMulti();
    fireEvent.contextMenu(screen.getByText('multi'));
    const beta = screen.getByRole('menuitem', { name: 'Beta' });
    await user.click(beta).catch(() => {});
    expect(calls).toEqual([]);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
