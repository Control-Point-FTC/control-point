// Regression for C-1: a confirm opened from inside an open Radix Sheet/Dialog
// (e.g. Delete in a task's detail sheet) must be clickable and keyboard
// reachable. The old in-tree overlay inherited the sheet's
// body { pointer-events: none }, lost focus to the sheet's trap and was
// aria-hidden, so the destructive action could never be confirmed.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../ui-kit/overlay';
import { DialogHost, confirmDialog, promptDialog } from '../dialog';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle>Task detail</SheetTitle>
          <SheetDescription>Details</SheetDescription>
          <button
            type="button"
            onClick={async () => onResult(await confirmDialog({ title: 'Delete task', message: 'Delete this task?', confirmLabel: 'Delete', danger: true }))}
          >
            Delete from sheet
          </button>
        </SheetContent>
      </Sheet>
      <span data-testid="sheet-state">{open ? 'open' : 'closed'}</span>
      <DialogHost />
    </>
  );
}

afterEach(cleanup);

describe('confirm dialogs opened inside a sheet (C-1)', () => {
  it('the confirm button is clickable and resolves true, and the sheet stays open', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(<Harness onResult={(v) => results.push(v)} />);
    await user.click(screen.getByRole('button', { name: 'Delete from sheet' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task' });
    expect(dialog).toBeInTheDocument();
    // Must not be under aria-hidden/inert content — i.e. reachable by role query.
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(getComputedStyle(confirm).pointerEvents).not.toBe('none');
    await user.click(confirm);
    await waitFor(() => expect(results).toEqual([true]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('sheet-state').textContent).toBe('open');
  });

  it('keyboard: Enter confirms; Escape cancels only the confirm, not the sheet', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    render(<Harness onResult={(v) => results.push(v)} />);
    await user.click(screen.getByRole('button', { name: 'Delete from sheet' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(results).toEqual([false]));
    expect(screen.getByTestId('sheet-state').textContent).toBe('open');

    await user.click(screen.getByRole('button', { name: 'Delete from sheet' }));
    await screen.findByRole('alertdialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(results).toEqual([false, true]));
  });

  it('typed confirmation inside a sheet: typing, exact-match confirm, and Escape keep the sheet open', async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    function PromptHarness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
              <SheetTitle>Workspace</SheetTitle>
              <SheetDescription>Danger zone</SheetDescription>
              <button
                type="button"
                onClick={async () => results.push(await promptDialog({ title: 'Delete workspace', message: 'Type the name', expected: 'Team A', confirmLabel: 'Delete', danger: true }))}
              >
                Delete workspace
              </button>
            </SheetContent>
          </Sheet>
          <span data-testid="prompt-sheet-state">{open ? 'open' : 'closed'}</span>
          <DialogHost />
        </>
      );
    }
    render(<PromptHarness />);

    // Escape cancels only the prompt.
    await user.click(screen.getByRole('button', { name: 'Delete workspace' }));
    await screen.findByRole('alertdialog', { name: 'Delete workspace' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(results).toEqual([false]));
    expect(screen.getByTestId('prompt-sheet-state').textContent).toBe('open');

    // Typing works (focus is in the input), a near-miss stays disabled, the exact text confirms.
    await user.click(screen.getByRole('button', { name: 'Delete workspace' }));
    const input = await screen.findByRole('textbox');
    await waitFor(() => expect(input).toHaveFocus());
    const del = screen.getByRole('button', { name: 'Delete' });
    await user.keyboard('Team');
    expect(del).toBeDisabled();
    await user.keyboard(' A');
    expect(del).toBeEnabled();
    await user.click(del);
    await waitFor(() => expect(results).toEqual([false, true]));
    expect(screen.getByTestId('prompt-sheet-state').textContent).toBe('open');
  });
});
