// Themed dropdown that replaces native <select> everywhere. Native selects
// render the OS menu (boxy Windows-style lists that ignore the dark theme),
// so this draws its own listbox with the app's tokens.
//
// Drop-in API: same props as <select> for the parts the app uses — value,
// onChange(e) with e.target.value, disabled, id, className, aria-label — and
// either <option> children or an `options` array. Call sites swap the tag
// name and keep their handlers.
import {
  Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './ui';

export interface SelectOption { value: string; label: ReactNode; disabled?: boolean }

/** What onChange receives: enough of a change event for `e.target.value`. */
export interface SelectChangeEvent { target: { value: string; id?: string }; currentTarget: { value: string; id?: string } }

export interface SelectProps {
  value?: string | number | null;
  onChange?: (e: SelectChangeEvent) => void;
  options?: { value: string | number; label: ReactNode; disabled?: boolean }[];
  children?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Extra classes for the open menu (e.g. a min width). */
  menuClassName?: string;
  placeholder?: ReactNode;
  title?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Plain text of a label, for typeahead. */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** Read <option> children (through fragments, arrays and conditionals). */
function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === Fragment) { out.push(...optionsFromChildren(child.props.children)); return; }
    if (child.type === 'option') {
      const label = child.props.children;
      out.push({ value: String(child.props.value ?? textOf(label)), label, disabled: !!child.props.disabled });
    }
  });
  return out;
}

const MENU_GAP = 4;
const MENU_MAX_HEIGHT = 288;

export function Select({
  value, onChange, options, children, disabled, id, className, menuClassName, placeholder, title,
  'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy,
}: SelectProps) {
  const opts = useMemo<SelectOption[]>(
    () => (options ? options.map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled })) : optionsFromChildren(children)),
    [options, children]
  );
  const current = value == null ? '' : String(value);
  const selectedIndex = opts.findIndex((o) => o.value === current);
  const selected = selectedIndex === -1 ? null : opts[selectedIndex];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const autoId = useId();
  const listId = `${id ?? autoId}-listbox`;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const enabledIndexes = useMemo(() => opts.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i !== -1), [opts]);

  const place = useCallback(() => {
    const b = buttonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - MENU_GAP - 8;
    const above = r.top - MENU_GAP - 8;
    const wanted = Math.min(MENU_MAX_HEIGHT, opts.length * 40 + 8);
    const up = below < wanted && above > below;
    const width = Math.max(r.width, 160);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setMenuStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + MENU_GAP } : { top: r.bottom + MENU_GAP }),
    });
  }, [opts.length]);

  const openMenu = useCallback((at?: number) => {
    if (disabled) return;
    place();
    setActive(at ?? (selectedIndex !== -1 ? selectedIndex : enabledIndexes[0] ?? -1));
    setOpen(true);
  }, [disabled, place, selectedIndex, enabledIndexes]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const choose = useCallback((i: number) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    if (o.value !== current) {
      const t = { value: o.value, id };
      onChange?.({ target: t, currentTarget: t });
    }
    close();
  }, [opts, current, onChange, id, close]);

  // Keep the menu attached while scrolling/resizing; close on outside press.
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close(false);
    };
    const onMove = () => place();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, close]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open || active < 0) return;
    const el = document.getElementById(optionId(active));
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const step = (from: number, dir: 1 | -1) => {
    if (!enabledIndexes.length) return -1;
    const pos = enabledIndexes.indexOf(from);
    if (pos === -1) return dir === 1 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
    return enabledIndexes[Math.min(enabledIndexes.length - 1, Math.max(0, pos + dir))];
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openMenu(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (k === 'Tab') { close(false); return; }
    if (k === 'ArrowDown') { e.preventDefault(); setActive((a) => step(a, 1)); return; }
    if (k === 'ArrowUp') { e.preventDefault(); setActive((a) => step(a, -1)); return; }
    if (k === 'Home') { e.preventDefault(); setActive(enabledIndexes[0] ?? -1); return; }
    if (k === 'End') { e.preventDefault(); setActive(enabledIndexes[enabledIndexes.length - 1] ?? -1); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (active >= 0) choose(active); return; }
    if (k.length === 1 && /\S/.test(k)) {
      // Typeahead: jump to the next option starting with the typed text.
      const now = Date.now();
      const ta = typeahead.current;
      ta.text = now - ta.at > 600 ? k.toLowerCase() : ta.text + k.toLowerCase();
      ta.at = now;
      const order = [...enabledIndexes.filter((i) => i > active), ...enabledIndexes.filter((i) => i <= active)];
      const hit = order.find((i) => textOf(opts[i].label).toLowerCase().startsWith(ta.text));
      if (hit !== undefined) setActive(hit);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        title={title}
        disabled={disabled}
        // Modals with capture-phase Escape handlers skip events from an
        // element that owns its own Escape (see SettingsModal / Sheet).
        data-esc-owner={open ? '' : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'inline-flex items-center justify-between gap-2 text-left min-w-0 cursor-pointer',
          'bg-elevated border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
      >
        <span className={cn('truncate', !selected && 'text-text-muted')}>{selected ? selected.label : placeholder ?? ' '}</span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && createPortal(
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-labelledby={ariaLabelledBy}
          aria-label={ariaLabelledBy ? undefined : ariaLabel}
          tabIndex={-1}
          style={menuStyle}
          className={cn(
            'z-[200] overflow-y-auto custom-scrollbar rounded-xl border border-text-base/10 bg-elevated py-1 shadow-xl shadow-black/20',
            menuClassName
          )}
          // Keep focus on the button (aria-activedescendant) while clicking.
          onMouseDown={(e) => e.preventDefault()}
        >
          {opts.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">No options</li>}
          {opts.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIndex}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => !o.disabled && setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none',
                i === active && !o.disabled && 'bg-text-base/[0.07]',
                i === selectedIndex ? 'text-text-base font-semibold' : 'text-text-base/85',
                o.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              <span className="flex-1 min-w-0 truncate">{o.label}</span>
              {i === selectedIndex && <Check className="w-4 h-4 shrink-0 text-accent" aria-hidden="true" />}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </>
  );
}

export default Select;
