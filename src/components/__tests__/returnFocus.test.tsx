// Dialogs and sheets hand focus back to whatever opened them when they close,
// even when they open from state (a button's onClick, a menu item) rather than
// a Radix trigger, and even when the opener has left the page by then (a row
// in a sheet or a menu that closed as the dialog opened). Radix alone dropped
// focus on <body> in every one of these.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, Sheet, SheetContent, SheetTitle, SheetDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Popover, PopoverTrigger, PopoverContent,
} from '../ui-kit/overlay';

afterEach(cleanup);

function Target({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; returnFocus?: () => HTMLElement | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent returnFocus={returnFocus}>
        <DialogTitle>Target</DialogTitle>
        <DialogDescription>Opened from state</DialogDescription>
        <button type="button">Inside</button>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens a sheet from state; rows in the sheet close it and open the dialog (the phone's More sheet). */
function SheetHarness({ menuInSheet = false }: { menuInSheet?: boolean }) {
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const fromSheet = () => { setSheet(false); setDialog(true); };
  return (
    <>
      <button ref={more} type="button" onClick={() => setSheet(true)}>More</button>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" returnFocus={() => more.current}>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>All sections</SheetDescription>
          <button type="button" onClick={fromSheet}>Row</button>
          {menuInSheet && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button">Account menu</button></DropdownMenuTrigger>
              <DropdownMenuContent><DropdownMenuItem onSelect={fromSheet}>Open target</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          )}
        </SheetContent>
      </Sheet>
      <Target open={dialog} onOpenChange={setDialog} />
    </>
  );
}

const escape = async (role: 'dialog' = 'dialog') => {
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole(role)).toBeNull());
};
const openMenu = async (trigger: HTMLElement) => {
  act(() => trigger.focus());
  fireEvent.keyDown(trigger, { key: 'Enter' });
  return screen.findByRole('menu');
};

describe('dialogs and sheets return focus to their opener', () => {
  it('a dialog opened from a plain button returns focus to it', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>Open</button><Target open={open} onOpenChange={setOpen} /></>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    act(() => opener.focus());
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    expect(document.activeElement).toBe(opener);
  });

  it.each(['keyboard', 'tap'])('a dialog whose field takes focus with autoFocus still returns focus to its opener (the command menu, %s)', async (how) => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Search</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Command menu</DialogTitle>
              <DialogDescription>Search pages</DialogDescription>
              <input autoFocus aria-label="Query" />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Search' });
    if (how === 'keyboard') act(() => opener.focus()); else { (document.activeElement as HTMLElement | null)?.blur(); fireEvent.pointerDown(opener); }
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Query' })).toHaveFocus());
    await escape();
    expect(document.activeElement).toBe(opener);
  });

  it('a dialog opened by a tap that left focus on the page (Safari) returns focus to the tapped button', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>Open</button><Target open={open} onOpenChange={setOpen} /></>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    expect(document.activeElement).toBe(opener);
  });

  it('a tapped button that left an earlier field focused (Safari) still gets focus back, not the field', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><input aria-label="Filter" /><button type="button" onClick={() => setOpen(true)}>Add part</button><Target open={open} onOpenChange={setOpen} /></>;
    }
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Filter' });
    const opener = screen.getByRole('button', { name: 'Add part' });
    act(() => field.focus());
    fireEvent.pointerDown(opener);
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    expect(document.activeElement).toBe(opener);
  });

  it('a sheet opened by a tap that left focus on the page (Safari) returns focus to returnFocus', async () => {
    render(<SheetHarness />);
    const more = screen.getByRole('button', { name: 'More' });
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(more);
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    await escape();
    expect(document.activeElement).toBe(more);
  });

  it.each(['keyboard', 'tap'])('a dialog opened from a row of a sheet that closes lands on the sheet\'s opener (%s)', async (how) => {
    render(<SheetHarness />);
    const more = screen.getByRole('button', { name: 'More' });
    if (how === 'keyboard') act(() => more.focus()); else (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    const row = within(sheet).getByRole('button', { name: 'Row' });
    if (how === 'keyboard') act(() => row.focus());
    fireEvent.click(row);
    const dialog = await screen.findByRole('dialog', { name: 'Target' });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('a dialog opened from a menu item lands on the menu\'s trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button">Account menu</button></DropdownMenuTrigger>
            <DropdownMenuContent><DropdownMenuItem onSelect={() => setOpen(true)}>Open target</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <Target open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    const menu = await openMenu(trigger);
    const item = within(menu).getByRole('menuitem', { name: 'Open target' });
    act(() => item.focus());
    fireEvent.keyDown(item, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Target' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('a caller ref on the menu still gets the element, and the trigger is still found', async () => {
    const seen: (HTMLElement | null)[] = [];
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button">Account menu</button></DropdownMenuTrigger>
            <DropdownMenuContent ref={(el) => { seen.push(el); }}><DropdownMenuItem onSelect={() => setOpen(true)}>Open target</DropdownMenuItem></DropdownMenuContent>
          </DropdownMenu>
          <Target open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    const menu = await openMenu(trigger);
    expect(seen).toContain(menu);
    const item = within(menu).getByRole('menuitem', { name: 'Open target' });
    act(() => item.focus());
    fireEvent.keyDown(item, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Target' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('a dialog opened from a menu inside a sheet that closes lands on the sheet\'s opener', async () => {
    render(<SheetHarness menuInSheet />);
    const more = screen.getByRole('button', { name: 'More' });
    act(() => more.focus());
    fireEvent.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    const menu = await openMenu(within(sheet).getByRole('button', { name: 'Account menu' }));
    const item = within(menu).getByRole('menuitem', { name: 'Open target' });
    act(() => item.focus());
    fireEvent.keyDown(item, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'Target' });
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('a sheet opened from a popover that closes lands on the popover trigger (calendar "+2 more")', async () => {
    function Harness() {
      const [pop, setPop] = useState(false);
      const [sheet, setSheet] = useState(false);
      return (
        <>
          <Popover open={pop} onOpenChange={setPop}>
            <PopoverTrigger asChild><button type="button">+2 more</button></PopoverTrigger>
            <PopoverContent><button type="button" onClick={() => { setPop(false); setSheet(true); }}>Event</button></PopoverContent>
          </Popover>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetContent><SheetTitle>Event</SheetTitle><SheetDescription>Details</SheetDescription></SheetContent>
          </Sheet>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '+2 more' });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const chip = await screen.findByRole('button', { name: 'Event' });
    act(() => chip.focus());
    fireEvent.click(chip);
    const sheet = await screen.findByRole('dialog', { name: 'Event' });
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    await escape();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('an onCloseAutoFocus that prevents the default keeps its own focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const other = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <button ref={other} type="button">Elsewhere</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); other.current?.focus(); }}>
              <DialogTitle>Target</DialogTitle>
              <DialogDescription>Own focus</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    act(() => opener.focus());
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    await escape();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }));
  });
});
