import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../ui';

export interface CtxMenuItem {
  label?: string;
  icon?: LucideIcon;
  danger?: boolean;
  /** Rendered dimmed, skipped by keyboard nav, and not activatable. */
  disabled?: boolean;
  /** Right-aligned hint text (e.g. a shortcut). Never the only indicator. */
  hint?: string;
  /** When true, renders a divider instead of an item. */
  separator?: boolean;
  action?: () => void | Promise<void>;
  /** Icon markup copied from an on-page action button (row toolbars). */
  iconHtml?: string;
}

/**
 * Given the right-clicked element, return menu items or null.
 * Registered per `data-cm-type` via useContextMenu.
 */
export type CtxMenuHandler = (el: HTMLElement) => CtxMenuItem[] | null;

const RegistryCtx = createContext<{
  register: (type: string, handler: CtxMenuHandler) => () => void;
} | null>(null);

/**
 * Register contextual right-click items for elements tagged with
 * `data-cm-type="<type>"` (plus `data-cm-id` for the row id).
 * The handler reads the element's dataset and closes over whatever
 * callbacks it needs — permissions and destructive confirms stay with
 * the owning component.
 */
export function useContextMenu(type: string, handler: CtxMenuHandler) {
  const reg = useContext(RegistryCtx);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!reg) return;
    const stable: CtxMenuHandler = (el) => ref.current(el);
    return reg.register(type, stable);
  }, [reg, type]);
}

/** Cases where the browser's own menu must win. */
function nativeMenuPreferred(target: EventTarget | null): boolean {
  // Element, not just HTMLElement: right-clicking an icon (SVG) in a row
  // should still reach the row's menu.
  if (!target || !(target instanceof Element)) return true;
  const el = target;
  // Form fields and editable content: cut/copy/paste, spellcheck, etc.
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  // Selected text: the user wants Copy.
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return true;
  // Links: open in new tab, copy link address, etc.
  if (el.closest('a[href]')) return true;
  return false;
}

// --- Rows without a registered handler ("context menus everywhere") -------
// A row's own "⋯" menu trigger is tagged data-cm-menu: right-click (or the
// menu key) anywhere in that row opens the same menu, so its items are never
// defined twice. A row with a hover toolbar instead (data-cm-row, buttons
// tagged data-cm-action) gets those buttons as a menu.

const ROW = 'li, tr, [role="row"], [role="listitem"], [data-cm-row-root]';

/** The ⋯ trigger of the row under `target`: the nearest ancestor holding
 *  exactly one trigger (once one holds several we're above row level), and
 *  only if `target` sits inside that trigger's own row, so right-clicking
 *  a page header never opens the menu of a list's only row. */
export function rowMenuTrigger(target: Element): HTMLElement | null {
  const own = target.closest<HTMLElement>('[data-cm-menu]');
  if (own) return own;
  for (let a: Element | null = target; a && a !== document.body; a = a.parentElement) {
    const found = a.querySelectorAll<HTMLElement>('[data-cm-menu]');
    if (found.length > 1) return null;
    if (found.length === 1) {
      const row = found[0].closest(ROW);
      return row && row.contains(target) ? found[0] : null;
    }
  }
  return null;
}

/** Menu items mirroring a row toolbar's buttons (label, icon, danger). */
export function rowToolbarItems(target: Element): CtxMenuItem[] | null {
  const row = target.closest('[data-cm-row]');
  if (!row) return null;
  const items: CtxMenuItem[] = [];
  row.querySelectorAll<HTMLButtonElement>('button[data-cm-action]').forEach((b) => {
    if (b.closest('[data-cm-row]') !== row) return; // a nested row's buttons
    const label = b.getAttribute('aria-label') || b.textContent?.trim() || '';
    if (!label) return;
    items.push({
      label,
      danger: b.dataset.cmAction === 'danger',
      disabled: b.disabled,
      iconHtml: b.querySelector('svg')?.outerHTML,
      action: () => b.click(),
    });
  });
  return items.length ? items : null;
}

/** Open a Radix dropdown the way a primary-button press would. */
function pressTrigger(trigger: HTMLElement) {
  const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  trigger.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: false }));
}

function isActionable(it: CtxMenuItem): boolean {
  return !it.separator && !it.disabled && typeof it.action === 'function';
}

interface OpenMenu {
  x: number;
  y: number;
  items: CtxMenuItem[];
  /** Element that had focus when the menu opened — focus returns here. */
  opener: HTMLElement | null;
  label: string;
}

const MENU_PAD = 8;
const MENU_EST_W = 240;

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, Set<CtxMenuHandler>>());
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const menuState = useRef<OpenMenu | null>(null);
  const menuEl = useRef<HTMLDivElement | null>(null);
  const itemEls = useRef<(HTMLButtonElement | null)[]>([]);

  const register = useCallback((type: string, handler: CtxMenuHandler) => {
    let set = handlers.current.get(type);
    if (!set) {
      set = new Set();
      handlers.current.set(type, set);
    }
    set.add(handler);
    return () => {
      handlers.current.get(type)?.delete(handler);
    };
  }, []);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    const m = menuState.current;
    if (!m) return;
    menuState.current = null;
    setMenu(null);
    setPos(null);
    if (restoreFocus && m.opener && document.contains(m.opener)) {
      const opener = m.opener;
      requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    }
  }, []);

  const openMenu = useCallback((anchor: HTMLElement, x: number, y: number, preset?: CtxMenuItem[]) => {
    let items: CtxMenuItem[] | null = preset ?? null;
    if (!items) {
      const set = handlers.current.get(anchor.dataset.cmType || '');
      if (!set) return false;
      for (const h of set) {
        items = h(anchor);
        if (items && items.length) break;
      }
    }
    // Never open a menu with nothing actionable — leave the native menu alone.
    if (!items || !items.some(isActionable)) return false;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const m: OpenMenu = {
      x: Math.max(MENU_PAD, Math.min(x, window.innerWidth - MENU_EST_W - MENU_PAD)),
      y: Math.max(MENU_PAD, Math.min(y, window.innerHeight - 120)),
      items,
      opener,
      label: anchor.getAttribute('aria-label') || anchor.dataset.cmLabel || anchor.dataset.cmType || 'Actions',
    };
    menuState.current = m;
    setMenu(m);
    return true;
  }, []);

  /** No registered handler: open the row's own ⋯ menu, or its toolbar as a menu. */
  const openFallback = useCallback((target: Element | null, x: number, y: number) => {
    if (!(target instanceof Element)) return false;
    const toolbar = rowToolbarItems(target);
    if (toolbar) {
      const row = target.closest<HTMLElement>('[data-cm-row]')!;
      return openMenu(row, x, y, toolbar);
    }
    const trigger = rowMenuTrigger(target);
    if (!trigger || (trigger as HTMLButtonElement).disabled) return false;
    pressTrigger(trigger);
    return true;
  }, [openMenu]);

  // Correct the position against the real measured size so the menu never
  // overflows any viewport edge.
  useLayoutEffect(() => {
    if (!menu || !menuEl.current) return;
    const r = menuEl.current.getBoundingClientRect();
    const x = Math.max(MENU_PAD, Math.min(menu.x, window.innerWidth - r.width - MENU_PAD));
    const y = Math.max(MENU_PAD, Math.min(menu.y, window.innerHeight - r.height - MENU_PAD));
    setPos({ x, y });
  }, [menu]);

  // Move focus into the menu when it opens (first actionable item).
  useLayoutEffect(() => {
    if (!menu) return;
    const idx = menu.items.findIndex(isActionable);
    const safe = idx >= 0 ? idx : 0;
    setFocusIdx(safe);
    const t = window.setTimeout(() => {
      itemEls.current[safe]?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [menu]);

  const activate = useCallback(
    (item: CtxMenuItem) => {
      if (!isActionable(item)) return;
      closeMenu(true);
      item.action!();
    },
    [closeMenu],
  );

  const enabledIndices = useCallback((items: CtxMenuItem[]) => {
    const out: number[] = [];
    items.forEach((it, i) => {
      if (isActionable(it)) out.push(i);
    });
    return out;
  }, []);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!menu) return;
    const enabled = enabledIndices(menu.items);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === 'Tab') {
      // Close and hand focus back to the opener synchronously, so the
      // browser's default Tab then continues the tab order from there.
      const opener = menu.opener;
      closeMenu(false);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
      return;
    }
    if (!enabled.length) return;
    const cur = enabled.indexOf(focusIdx);
    const move = (at: number) => {
      const ni = enabled[at];
      setFocusIdx(ni);
      itemEls.current[ni]?.focus({ preventScroll: true });
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move((cur + 1) % enabled.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move((cur - 1 + enabled.length) % enabled.length);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(enabled.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (cur >= 0) activate(menu.items[enabled[cur]]);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // Right-clicking the open menu itself keeps it open (native behavior).
      if (menuEl.current?.contains(e.target as Node)) return;
      // Opening another menu replaces the current one.
      closeMenu(false);
      if (nativeMenuPreferred(e.target)) return;
      const el = (e.target as HTMLElement).closest?.('[data-cm-type]') as HTMLElement | null;
      if (el) {
        if (openMenu(el, e.clientX, e.clientY)) e.preventDefault();
        return;
      }
      if (openFallback(e.target as Element, e.clientX, e.clientY)) e.preventDefault();
      // otherwise nothing custom here — leave the native menu alone
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!menuState.current) return;
      if (menuEl.current?.contains(e.target as Node)) return;
      // Clicking anywhere else dismisses without yanking focus back.
      closeMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
      if (menuKey) {
        if (menuState.current) {
          // Toggle: menu key while open closes it.
          e.preventDefault();
          closeMenu(true);
          return;
        }
        if (nativeMenuPreferred(e.target)) return;
        const el = (e.target as HTMLElement).closest?.('[data-cm-type]') as HTMLElement | null;
        if (!el) {
          const t = e.target as Element;
          const r = t.getBoundingClientRect();
          if (openFallback(t, r.left, r.bottom + 4)) e.preventDefault();
          return;
        }
        e.preventDefault();
        const r = el.getBoundingClientRect();
        openMenu(el, r.left, r.bottom + 4);
        return;
      }
      // Escape outside the menu container (focus may be elsewhere) still closes.
      if (e.key === 'Escape' && menuState.current) closeMenu(true);
    };
    const onScrollResize = () => closeMenu(false);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('blur', onScrollResize);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('blur', onScrollResize);
    };
  }, [openMenu, closeMenu, openFallback]);

  const renderPos = pos ?? (menu ? { x: menu.x, y: menu.y } : { x: 0, y: 0 });

  return (
    <RegistryCtx.Provider value={{ register }}>
      {children}
      {menu && (
        <div
          ref={menuEl}
          role="menu"
          aria-label={menu.label}
          aria-orientation="vertical"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onMenuKeyDown}
          className="fixed z-[100] min-w-[220px] max-w-[calc(100vw-16px)] max-h-[min(70vh,26rem)] overflow-y-auto custom-scrollbar rounded-xl border border-line bg-elevated/95 backdrop-blur-md shadow-2xl p-1.5"
          style={{ left: renderPos.x, top: renderPos.y }}
        >
          {menu.items.map((it, i) => {
            if (it.separator) {
              return <div key={i} role="separator" className="my-1 h-px bg-text-base/10" />;
            }
            const Icon = it.icon;
            const actionable = isActionable(it);
            return (
              <button
                key={i}
                ref={(el) => {
                  itemEls.current[i] = el;
                }}
                type="button"
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                disabled={it.disabled}
                tabIndex={i === focusIdx ? 0 : -1}
                onFocus={() => setFocusIdx(i)}
                onClick={() => activate(it)}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-inset',
                  it.danger
                    ? 'text-rose-400 hover:bg-rose-500/15 focus-visible:bg-rose-500/15'
                    : 'text-text-base/85 hover:bg-text-base/[0.07] hover:text-text-base focus-visible:bg-text-base/[0.07]',
                  'disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                {Icon && <Icon className="w-4 h-4 shrink-0 opacity-70" aria-hidden="true" />}
                {!Icon && it.iconHtml && (
                  // Markup copied from our own rendered icon (see rowToolbarItems).
                  <span className="flex w-4 h-4 shrink-0 opacity-70 [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true" dangerouslySetInnerHTML={{ __html: it.iconHtml }} />
                )}
                <span className="truncate flex-1">{it.label}</span>
                {it.hint && (
                  <span className="text-[11px] text-text-muted shrink-0" aria-hidden="true">
                    {it.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </RegistryCtx.Provider>
  );
}
