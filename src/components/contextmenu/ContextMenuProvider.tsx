import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../ui';

export interface CtxMenuItem {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  action: () => void | Promise<void>;
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
  if (!target || !(target instanceof HTMLElement)) return true;
  const el = target as HTMLElement;
  // Form fields and editable content: cut/copy/paste, spellcheck, etc.
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  // Selected text: the user wants Copy.
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return true;
  // Links: open in new tab, copy link address, etc.
  if (el.closest('a[href]')) return true;
  return false;
}

interface OpenMenu {
  x: number;
  y: number;
  items: CtxMenuItem[];
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, Set<CtxMenuHandler>>());
  const [menu, setMenu] = useState<OpenMenu | null>(null);

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

  useEffect(() => {
    const close = () => setMenu(null);
    const onContextMenu = (e: MouseEvent) => {
      if (nativeMenuPreferred(e.target)) return;
      const el = (e.target as HTMLElement).closest?.('[data-cm-type]') as HTMLElement | null;
      if (!el) return; // nothing custom here — leave the native menu alone
      const set = handlers.current.get(el.dataset.cmType || '');
      if (!set) return;
      let items: CtxMenuItem[] | null = null;
      for (const h of set) {
        items = h(el);
        if (items && items.length) break;
      }
      if (!items || !items.length) return;
      e.preventDefault();
      const pad = 8;
      const w = 230;
      const h = items.length * 38 + 12;
      setMenu({
        x: Math.max(pad, Math.min(e.clientX, window.innerWidth - w - pad)),
        y: Math.max(pad, Math.min(e.clientY, window.innerHeight - h - pad)),
        items,
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, []);

  return (
    <RegistryCtx.Provider value={{ register }}>
      {children}
      {menu && (
        <div
          role="menu"
          aria-label="Context menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-[100] w-[230px] rounded-xl border border-text-base/10 bg-[#141419]/95 backdrop-blur-md shadow-2xl p-1.5"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.items.map((it, i) => {
            const Icon = it.icon;
            return (
              <button
                key={i}
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  it.action();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-left transition-colors',
                  it.danger
                    ? 'text-rose-300 hover:bg-rose-500/15'
                    : 'text-text-base/85 hover:bg-text-base/[0.07] hover:text-text-base',
                )}
              >
                {Icon && <Icon className="w-4 h-4 shrink-0 opacity-70" />}
                <span className="truncate">{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </RegistryCtx.Provider>
  );
}
