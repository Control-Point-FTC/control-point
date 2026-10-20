// shadcn/ui overlays (Dialog, Sheet, DropdownMenu, Popover, Tooltip) on Radix,
// mapped to Control Point tokens. Overlay content is marked data-esc-owner so
// SettingsModal / the scout Sheet leave Escape to Radix while one is open.
import * as React from 'react';
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from 'radix-ui';
import { X, Check, ChevronRight } from 'lucide-react';
import { cn } from '../cn';

const panel = 'bg-elevated text-text-base border border-line shadow-2xl';

/**
 * Our own portalled menus (the themed Select, marked data-cp-portal) render
 * outside a Radix dialog's DOM. Treat clicks there as inside the dialog, and
 * let a focused control that owns Escape (data-esc-owner, e.g. an open Select)
 * close itself instead of the whole dialog.
 */
function outsideGuards<P extends { onPointerDownOutside?: (e: any) => void; onInteractOutside?: (e: any) => void; onEscapeKeyDown?: (e: any) => void }>(props: P, slot: string) {
  const inPortal = (e: any) => {
    const t = (e?.detail?.originalEvent?.target ?? e?.target) as Element | null;
    return !!t?.closest?.('[data-cp-portal]');
  };
  return {
    onPointerDownOutside: (e: any) => { if (inPortal(e)) e.preventDefault(); props.onPointerDownOutside?.(e); },
    onInteractOutside: (e: any) => { if (inPortal(e)) e.preventDefault(); props.onInteractOutside?.(e); },
    onEscapeKeyDown: (e: any) => {
      const owner = (document.activeElement as Element | null)?.closest?.('[data-esc-owner]');
      if (owner && owner.getAttribute('data-slot') !== slot) e.preventDefault();
      props.onEscapeKeyDown?.(e);
    },
  };
}
const fade = 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

/**
 * Focus goes back to whatever opened a dialog or sheet when it closes. Radix only returns it to a
 * Dialog.Trigger; most of ours open from state (a button's onClick, a menu item, an app event), and focus
 * then fell to the page's top. The opener is whatever had focus as the content opens (or, in Safari, the
 * button just tapped, which it doesn't focus). If it has left the page by the time the content closes,
 * focus goes to the first of these still on the page: the trigger of the menu or popover the opener was in,
 * then wherever the dialog or sheet the opener was in would have sent focus (so a dialog opened from a row
 * of the phone's More sheet, which closes as the dialog opens, lands on More), then `returnFocus`. Failing
 * all of them, Radix's own behaviour stands.
 */
type ReturnTarget = () => HTMLElement | null | undefined;
type ReturnFocus = { /** Where focus goes on close when the opener is gone or unknown (e.g. the button that opened a sheet the opener lived in). */ returnFocus?: ReturnTarget };
type Target = HTMLElement | ReturnTarget;

/** Each open dialog's or sheet's return targets, by its content element, for one opened from inside it. */
const returnTargets = new WeakMap<Element, Target[]>();
/** Each menu's or popover's trigger, by its content element. Radix links them only while open (a menu is
 *  labelled by its trigger, a popover's trigger controls it), so it's looked up as the content mounts. */
const triggers = new WeakMap<Element, HTMLElement>();
const POPUP = '[role="menu"], [data-slot="popover-content"]';
function findTrigger(popup: Element) {
  const by = popup.getAttribute('aria-labelledby');
  const t = (by && document.getElementById(by)) || (popup.id && document.querySelector(`[aria-controls="${CSS.escape(popup.id)}"]`));
  return t instanceof HTMLElement ? t : null;
}
const rememberTrigger = (popup: HTMLElement | null) => {
  const trigger = popup && findTrigger(popup);
  if (trigger) triggers.set(popup, trigger);
};
/** The last element to take focus, and where it came from. Without exit animations (reduced motion) a sheet
 *  or menu can leave the page before the dialog it opened mounts, taking the focused row with it, so focus is
 *  on <body> by then; and a field with autoFocus takes focus before the content's open handler runs. */
let lastFocused: Element | null = null;
let focusedFrom: Element | null = null;
/** The control last pressed with a pointer, if that came after the last focus change: Safari doesn't focus
 *  a tapped button. A key press forgets it. */
let lastPressed: Element | null = null;
const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => { focusedFrom = lastPressed ?? lastFocused; lastFocused = e.target as Element; lastPressed = null; }, true);
  document.addEventListener('pointerdown', (e) => { lastPressed = (e.target as Element | null)?.closest?.(CONTROL) ?? null; }, true);
  document.addEventListener('keydown', () => { lastPressed = null; }, true);
}
/** What had focus as `content` opened. */
function openerOf(content: Element): HTMLElement | null {
  let a: Element | null = document.activeElement;
  // An autoFocus field inside the content already took focus: the opener is where it came from.
  if (a && content.contains(a)) a = a === lastFocused ? focusedFrom : null;
  // Focus fell to <body> because the opener left the page (its sheet or menu closed first), or never had it
  // (a tapped button in Safari).
  if (!a || a === document.body) a = lastPressed ? (content.contains(lastPressed) ? null : lastPressed) : lastFocused && !lastFocused.isConnected ? lastFocused : null;
  return a instanceof HTMLElement ? a : null;
}

/** Where focus can go back to for an opener, best first. Menus and overlays are looked up while they are
 *  still in the tree (or detached with it), so the chain survives them closing. */
function targetsFor(opener: Element | null, depth = 0): Target[] {
  if (!opener || depth > 8) return [];
  const own: Target[] = opener instanceof HTMLElement ? [opener] : [];
  const popup = opener.closest(POPUP);
  const trigger = popup && (triggers.get(popup) ?? findTrigger(popup));
  if (trigger) return [...own, ...targetsFor(trigger, depth + 1)];
  const overlay = opener.closest('[data-slot="dialog-content"], [data-slot="sheet-content"]');
  return [...own, ...((overlay && returnTargets.get(overlay)) ?? [])];
}

function useReturnFocus<P extends { ref?: React.Ref<HTMLDivElement>; onCloseAutoFocus?: (e: Event) => void }>(props: P, fallback?: ReturnTarget) {
  const targets = React.useRef<Target[]>([]);
  const latest = React.useRef({ fallback, ref: props.ref });
  React.useEffect(() => { latest.current = { fallback, ref: props.ref }; });
  // The opener is read as the content mounts, not in onOpenAutoFocus: Radix skips that when a field inside
  // took focus first (autoFocus). Stable, so it runs once per opening rather than on every render.
  const ref = React.useCallback((el: HTMLDivElement | null) => {
    if (el) {
      targets.current = [...targetsFor(openerOf(el)), () => latest.current.fallback?.()];
      returnTargets.set(el, targets.current);
    }
    const own = latest.current.ref;
    if (typeof own === 'function') own(el);
    else if (own) own.current = el;
  }, []);
  return {
    ref,
    onCloseAutoFocus: (e: Event) => {
      props.onCloseAutoFocus?.(e);
      let el: HTMLElement | null | undefined;
      for (const t of targets.current) { el = typeof t === 'function' ? t() : t; if (el?.isConnected) break; el = null; }
      targets.current = [];
      if (e.defaultPrevented || !el) return;
      e.preventDefault();
      el.focus();
    },
  };
}

// --- Dialog -----------------------------------------------------------------

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof D.Overlay>) {
  return <D.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm', fade, className)} {...props} />;
}

export function DialogContent({ className, children, showClose = true, returnFocus: fallback, ...props }: React.ComponentProps<typeof D.Content> & { showClose?: boolean } & ReturnFocus) {
  const returnFocus = useReturnFocus(props, fallback);
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        data-slot="dialog-content"
        data-esc-owner=""
        className={cn(
          panel,
          'fixed left-1/2 top-1/2 z-[81] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto',
          fade,
          className,
        )}
        {...props}
        {...returnFocus}
        {...outsideGuards(props, 'dialog-content')}
      >
        {children}
        {showClose && (
          <D.Close className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted transition-colors hover:bg-text-base/[0.08] hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title data-slot="dialog-title" className={cn('font-display text-lg font-bold text-text-base', className)} {...props} />;
}
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description data-slot="dialog-description" className={cn('text-sm text-text-muted', className)} {...props} />;
}

// --- Sheet (side panel built on Dialog) -----------------------------------------

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

const sides = {
  right: 'inset-y-0 right-0 h-full w-full sm:max-w-md border-l rounded-l-2xl',
  left: 'inset-y-0 left-0 h-full w-full sm:max-w-md border-r rounded-r-2xl',
  bottom: 'inset-x-0 bottom-0 max-h-[90dvh] border-t rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
  top: 'inset-x-0 top-0 max-h-[90dvh] border-b rounded-b-2xl',
} as const;

export function SheetContent({ className, children, side = 'right', returnFocus: fallback, ...props }: React.ComponentProps<typeof D.Content> & { side?: keyof typeof sides } & ReturnFocus) {
  const returnFocus = useReturnFocus(props, fallback);
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        data-slot="sheet-content"
        data-esc-owner=""
        className={cn(panel, 'fixed z-[81] flex flex-col gap-4 overflow-y-auto p-6', sides[side], fade, className)}
        {...props}
        {...returnFocus}
        {...outsideGuards(props, 'sheet-content')}
      >
        {children}
        <D.Close className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted transition-colors hover:bg-text-base/[0.08] hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export const SheetHeader = DialogHeader;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;
export const SheetFooter = DialogFooter;

// --- DropdownMenu -----------------------------------------------------------

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;
export const DropdownMenuRadioGroup = DM.RadioGroup;

const menuPanel = cn(panel, 'z-[90] min-w-[10rem] overflow-hidden rounded-xl p-1', fade);
const menuItem =
  'relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors ' +
  'focus:bg-text-base/[0.08] data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content ref={rememberTrigger} data-slot="dropdown-menu-content" data-esc-owner="" sideOffset={sideOffset} className={cn(menuPanel, className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, variant, ...props }: React.ComponentProps<typeof DM.Item> & { variant?: 'default' | 'destructive' }) {
  return <DM.Item data-slot="dropdown-menu-item" className={cn(menuItem, variant === 'destructive' && 'text-destructive-text focus:bg-rose-500/10', className)} {...props} />;
}
export function DropdownMenuCheckboxItem({ className, children, ...props }: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem data-slot="dropdown-menu-checkbox-item" className={cn(menuItem, 'pl-8', className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DM.ItemIndicator><Check className="text-accent" /></DM.ItemIndicator>
      </span>
      {children}
    </DM.CheckboxItem>
  );
}
export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem data-slot="dropdown-menu-radio-item" className={cn(menuItem, 'pl-8', className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DM.ItemIndicator><span className="size-2 rounded-full bg-accent" /></DM.ItemIndicator>
      </span>
      {children}
    </DM.RadioItem>
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label data-slot="dropdown-menu-label" className={cn('px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70', className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator data-slot="dropdown-menu-separator" className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}
export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="dropdown-menu-shortcut" className={cn('ml-auto text-[11px] tracking-widest text-text-muted', className)} {...props} />;
}
export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof DM.SubTrigger>) {
  return (
    <DM.SubTrigger data-slot="dropdown-menu-sub-trigger" className={cn(menuItem, 'data-[state=open]:bg-text-base/[0.08]', className)} {...props}>
      {children}
      <ChevronRight className="ml-auto" />
    </DM.SubTrigger>
  );
}
export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) {
  return (
    <DM.Portal>
      <DM.SubContent ref={rememberTrigger} data-slot="dropdown-menu-sub-content" data-esc-owner="" className={cn(menuPanel, className)} {...props} />
    </DM.Portal>
  );
}

// --- Popover ----------------------------------------------------------------

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export function PopoverContent({ className, align = 'center', sideOffset = 6, container, ...props }: React.ComponentProps<typeof P.Content> & {
  /** Portal target (e.g. a fullscreen element, so the popover stays visible inside it). */
  container?: HTMLElement | null;
}) {
  return (
    <P.Portal container={container ?? undefined}>
      <P.Content
        ref={rememberTrigger}
        data-slot="popover-content"
        data-esc-owner=""
        align={align}
        sideOffset={sideOffset}
        className={cn(panel, 'z-[90] w-72 rounded-xl p-4 outline-none', fade, className)}
        {...props}
      />
    </P.Portal>
  );
}

// --- Tooltip ----------------------------------------------------------------

export const TooltipProvider = T.Provider;
export function Tooltip({ delayDuration = 250, ...props }: React.ComponentProps<typeof T.Root>) {
  return <T.Root delayDuration={delayDuration} {...props} />;
}
export const TooltipTrigger = T.Trigger;
export function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof T.Content>) {
  return (
    <T.Portal>
      <T.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn('z-[95] rounded-lg bg-text-base px-2.5 py-1.5 text-xs font-medium text-primary shadow-lg', fade, className)}
        {...props}
      >
        {children}
      </T.Content>
    </T.Portal>
  );
}
