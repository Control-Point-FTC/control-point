// Ribbon building blocks: labelled groups, command buttons with tooltips and
// shortcuts, split buttons (a main action plus a menu) and color palettes.
// Every command has an accessible name; icon-only buttons explain themselves
// on hover/focus. Buttons never take focus from the page on mouse down, so
// the text selection a command acts on stays put.
import React, { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui-kit';
import { notebookCommandGlyph } from '../NotebookIcons';

export function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="group" aria-label={label} className="nb-rgroup">{children}</div>;
}

type ButtonProps = {
  label: string; icon?: string; accent?: string; showLabel?: boolean; active?: boolean; disabled?: boolean;
  shortcut?: string; onClick: () => void; className?: string;
};
export function RibbonButton({ label, icon, accent, showLabel, active, disabled, shortcut, onClick, className }: ButtonProps) {
  const Glyph = notebookCommandGlyph(icon ?? label);
  return <button type="button" className={`nb-rbtn ${showLabel || !Glyph ? 'has-label' : ''} ${active ? 'is-active' : ''} ${className ?? ''}`}
    title={shortcut ? `${label} (${shortcut})` : label} aria-label={label} aria-pressed={active === undefined ? undefined : active}
    disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick}>
    {Glyph && <Glyph size={18} accent={accent} />}{(showLabel || !Glyph) && <span>{label}</span>}
  </button>;
}

/** A main action with a menu of related ones (OneNote's split buttons). */
export function RibbonSplit({ menuLabel, children, align = 'start', ...main }: ButtonProps & { menuLabel: string; children: React.ReactNode; align?: 'start' | 'end' }) {
  const menu = useMenuFocus();
  return <span className="nb-rsplit">
    <RibbonButton {...main} />
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><button ref={menu.trigger} type="button" className="nb-rsplit-arrow" aria-label={menuLabel} title={menuLabel} disabled={main.disabled} onMouseDown={e => e.preventDefault()}><ChevronDown size={13} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="nb-rmenu" {...menu.content}>{children}</DropdownMenuContent>
    </DropdownMenu>
  </span>;
}

/** A labelled dropdown (no main action), e.g. alignment or tags. */
export function RibbonMenu({ label, icon, showLabel, disabled, children }: { label: string; icon?: string; showLabel?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const Glyph = notebookCommandGlyph(icon ?? label);
  const menu = useMenuFocus();
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild><button ref={menu.trigger} type="button" className={`nb-rbtn ${showLabel || !Glyph ? 'has-label' : ''}`} aria-label={label} title={label} disabled={disabled} onMouseDown={e => e.preventDefault()}>{Glyph && <Glyph size={18} />}{(showLabel || !Glyph) && <span>{label}</span>}<ChevronDown size={13} /></button></DropdownMenuTrigger>
    <DropdownMenuContent className="nb-rmenu" {...menu.content}>{children}</DropdownMenuContent>
  </DropdownMenu>;
}

export const RibbonItem = DropdownMenuItem;

/** Focus after a menu closes: Escape returns it to the menu's own button so
 *  keyboard users keep their place. A command keeps the page focused, and
 *  clicking another control leaves focus on that control. */
function useMenuFocus() {
  const trigger = useRef<HTMLButtonElement>(null);
  const escaped = useRef(false);
  return {
    trigger,
    content: {
      onEscapeKeyDown: () => { escaped.current = true; },
      onCloseAutoFocus: (e: Event) => {
        e.preventDefault();
        if (escaped.current) trigger.current?.focus();
        escaped.current = false;
      },
    },
  };
}

/** Swatches, a custom color and a reset entry. */
export function ColorPalette({ label, colors, value, onPick, resetLabel, onReset }: { label: string; colors: readonly string[]; value?: string | null; onPick: (color: string) => void; resetLabel: string; onReset: () => void }) {
  return <div className="nb-palette" role="group" aria-label={label}>
    <div className="nb-palette-grid">{colors.map(c => <DropdownMenuItem key={c} className="nb-swatch" aria-label={`${label}: ${c}`} title={c} aria-checked={value?.toLowerCase() === c.toLowerCase()} role="menuitemradio" onSelect={() => onPick(c)}><span style={{ background: c }} /></DropdownMenuItem>)}</div>
    <label className="nb-palette-custom" onKeyDown={e => e.stopPropagation()}>Custom <input type="color" aria-label={`Custom ${label.toLowerCase()}`} defaultValue={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#3b82f6'} onChange={e => onPick(e.target.value)} /></label>
    <DropdownMenuItem onSelect={onReset}>{resetLabel}</DropdownMenuItem>
  </div>;
}
