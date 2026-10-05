// Shared building blocks for the scouting screens (Compete / Analyze):
// freshness badges, the side-panel / bottom-sheet, hover popovers,
// sparklines, skeletons and empty / error states. Styling follows the
// existing Team Stats look (card-surface, accent pills, placement badges).
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, CircleAlert, Inbox } from 'lucide-react';
import { cn } from '../ui';
import type { FtcFreshness } from '../../types/ftcScout';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/** Below md (768px) we use bottom sheets and stacked cards. */
export function useIsNarrow(): boolean {
  const q = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    on();
    // 'resize' too: some embedded/emulated viewports don't fire 'change'.
    mq.addEventListener('change', on);
    window.addEventListener('resize', on);
    return () => { mq.removeEventListener('change', on); window.removeEventListener('resize', on); };
  }, []);
  return narrow;
}

export const SEASON_NAMES: Record<number, string> = { 2022: 'POWERPLAY', 2023: 'CENTERSTAGE', 2024: 'INTO THE DEEP', 2025: 'DECODE', 2026: 'BIOBUZZ' };
export const ALL_SEASONS = [2026, 2025, 2024, 2023, 2022];
export const seasonShort = (s: number) => `${s}–${String(s + 1).slice(2)}`;

export function SeasonPicker({ seasons, value, onChange, small }: { seasons: number[]; value: number; onChange: (s: number) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Season">
      {seasons.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={s === value}
          onClick={() => onChange(s)}
          title={SEASON_NAMES[s] ? `${seasonShort(s)} · ${SEASON_NAMES[s]}` : seasonShort(s)}
          className={cn(
            'rounded-full font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            small ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
            s === value
              ? 'bg-accent text-accent-ink shadow-[0_4px_16px_rgba(255,199,0,0.25)]'
              : 'bg-text-base/5 text-text-muted hover:text-text-base hover:bg-text-base/10 border border-text-base/10'
          )}
        >
          {seasonShort(s)}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Freshness / source badges
// ---------------------------------------------------------------------------

export function relTime(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Every major section shows where its data came from and how fresh it is. */
export function SourceBadge({ f, className }: { f: FtcFreshness | null | undefined; className?: string }) {
  if (!f) return null;
  const origin = f.source === 'cache' ? f.origin : f.source;
  const label = origin === 'first-events' ? 'FIRST Events live' : 'FTC Scout fallback';
  const tone = f.stale ? 'border-rose-400/40 text-rose-300' : f.partial ? 'border-amber-400/40 text-amber-300' : origin === 'first-events' ? 'border-emerald-400/40 text-emerald-300' : 'border-text-base/20 text-text-muted';
  return (
    <span
      className={cn('inline-flex flex-wrap items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', tone, className)}
      title={`Fetched ${f.fetchedAt ? new Date(f.fetchedAt).toLocaleString() : 'unknown'}`}
    >
      <span>● {label}</span>
      {(f.cached || f.source === 'cache') && <span className="opacity-80">· Cached</span>}
      {f.stale && <span>· Stale</span>}
      {f.partial && <span>· Partial</span>}
      <span className="normal-case font-semibold tracking-normal opacity-80">· {relTime(f.fetchedAt)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sheet: right side panel on desktop, bottom sheet on mobile
// ---------------------------------------------------------------------------

// Open sheets, bottom → top. Only the top one owns Escape / Tab.
const sheetStack: object[] = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, subtitle, children, wide }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const narrow = useIsNarrow();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Keep the latest onClose without re-running the open/close effect.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const token = {};
    sheetStack.push(token);
    const prev = document.activeElement as HTMLElement | null;
    // Capture phase on window runs before any other keydown handler (Bruno,
    // sheets underneath), and only the topmost sheet handles the key.
    const onKey = (e: KeyboardEvent) => {
      if (sheetStack[sheetStack.length - 1] !== token) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Focus trap: Tab / Shift+Tab cycle inside the panel.
      const f = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    // Move focus into the panel for keyboard users; restore on close.
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('[data-autofocus],button')?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(t);
      const i = sheetStack.indexOf(token);
      if (i !== -1) sheetStack.splice(i, 1);
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label="Close panel" className="absolute inset-0 bg-black/55 backdrop-blur-[2px] cursor-default" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'absolute flex flex-col card-surface shadow-2xl overflow-hidden',
          narrow
            ? 'inset-x-0 bottom-0 max-h-[88dvh] rounded-b-none rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
            : cn('top-0 right-0 h-full rounded-none rounded-l-2xl', wide ? 'w-[min(720px,92vw)]' : 'w-[min(520px,92vw)]')
        )}
      >
        {narrow && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-text-base/20" aria-hidden="true" />}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-text-base/10">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="font-display font-bold text-text-base text-lg leading-tight break-words">{title}</h3>
            {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            data-autofocus
            className="p-2 -m-1 rounded-xl text-text-muted hover:text-text-base hover:bg-text-base/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Hover / focus popover for quick summaries
// ---------------------------------------------------------------------------

export function QuickPop({ children, content, className }: { children: ReactNode; content: ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex group/qp', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 hidden w-64 rounded-xl card-surface p-3 text-xs text-text-base/90 shadow-xl md:group-hover/qp:block md:group-focus-within/qp:block"
      >
        {content}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sparkline (clickable)
// ---------------------------------------------------------------------------

export function Sparkline({ values, height = 36, className, label }: { values: (number | null)[]; height?: number; className?: string; label: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) {
    return <div className={cn('text-[11px] text-text-muted/70 h-9 flex items-center', className)} aria-label={`${label}: not enough data`}>Not enough events yet</div>;
  }
  const w = 120;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * (w - 4) + 2);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className={cn('w-full', className)} style={{ height }} role="img" aria-label={`${label} trend`}>
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="3" fill="var(--color-accent)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loading / empty / error
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-text-base/[0.07]', className)} aria-hidden="true" />;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-surface p-6 flex flex-col items-center text-center gap-2" role="status">
      <Inbox className="w-7 h-7 text-text-muted" />
      <p className="font-display font-bold text-text-base">{title}</p>
      {body && <p className="text-sm text-text-muted max-w-md">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, note }: { message: string; onRetry?: () => void; note?: ReactNode }) {
  return (
    <div className="card-surface p-5 flex flex-col sm:flex-row sm:items-center gap-3" role="alert">
      <CircleAlert className="w-6 h-6 text-rose-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-base font-semibold">{message}</p>
        {note && <p className="text-xs text-text-muted mt-0.5">{note}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-lg px-2 py-1 self-start sm:self-auto">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive stat (button with a visible affordance)
// ---------------------------------------------------------------------------

export const statButtonClass =
  'text-left rounded-xl transition-colors hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 cursor-pointer underline-offset-4 decoration-dotted hover:underline';

// Placement badge: 1st gold, 2nd silver, 3rd bronze, everything else light grey.
export function placementClass(rank: number | null): string {
  if (rank === 1) return 'bg-[#FFD54A] text-black';
  if (rank === 2) return 'bg-[#C9D2DC] text-black';
  if (rank === 3) return 'bg-[#E0A266] text-black';
  return 'bg-text-base/[0.22] text-text-base';
}

export const fmt = (v: number | null | undefined, digits = 1): string => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(digits));

// ---------------------------------------------------------------------------
// Alliance + season colors (immersive accents on the dark/volt design)
// ---------------------------------------------------------------------------

/** Red / blue alliance styling: tinted surface, edge, text, solid chip. */
export const ALLIANCE = {
  red: {
    surface: 'bg-[linear-gradient(135deg,rgba(239,68,68,0.16),rgba(239,68,68,0.04))]',
    edge: 'border-red-500/35',
    text: 'text-red-300',
    chip: 'bg-red-500/90 text-white',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    label: 'Red',
  },
  blue: {
    surface: 'bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(59,130,246,0.04))]',
    edge: 'border-blue-500/35',
    text: 'text-blue-300',
    chip: 'bg-blue-500/90 text-white',
    dot: 'bg-blue-500',
    bar: 'bg-blue-500',
    label: 'Blue',
  },
} as const;

/** Signature color per FTC season, used for the season chip and trend accents. */
export const SEASON_COLOR: Record<number, { hex: string; chip: string }> = {
  2022: { hex: '#F59E0B', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },     // POWERPLAY
  2023: { hex: '#A855F7', chip: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },  // CENTERSTAGE
  2024: { hex: '#06B6D4', chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },        // INTO THE DEEP
  2025: { hex: '#22C55E', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }, // DECODE
  2026: { hex: '#84CC16', chip: 'bg-lime-500/15 text-lime-300 border-lime-500/30' },        // BIOBUZZ
};

export function SeasonChip({ season }: { season: number }) {
  const c = SEASON_COLOR[season];
  return (
    <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border', c?.chip || 'bg-accent/15 text-accent border-accent/30')}>
      {seasonShort(season)}{SEASON_NAMES[season] ? ` · ${SEASON_NAMES[season]}` : ''}
    </span>
  );
}

/** W / L / T pill from the selected team's perspective. */
export function ResultPill({ result }: { result: 'win' | 'loss' | 'tie' | null }) {
  if (!result) return <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Unplayed</span>;
  const map = {
    win: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    loss: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    tie: 'bg-text-base/10 text-text-base border-text-base/20',
  } as const;
  return <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border', map[result])}>{result === 'win' ? 'W' : result === 'loss' ? 'L' : 'T'}</span>;
}
