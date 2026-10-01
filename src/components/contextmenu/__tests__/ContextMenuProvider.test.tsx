import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenuProvider, useContextMenu } from '../ContextMenuProvider';

afterEach(cleanup);

function Harness({ onAction }: { onAction: () => void }) {
  useContextMenu('thing', (el) => {
    if (el.dataset.cmId !== '1') return null;
    return [{ label: 'Do the thing', action: onAction }];
  });
  return (
    <div>
      <div data-cm-type="thing" data-cm-id="1">right-click me</div>
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
});
