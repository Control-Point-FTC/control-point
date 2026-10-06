// Modern signed-out frame (phase 9b): a split screen. On wide screens a living
// brand panel sits on the left (drifting light, rotating highlights from the
// product); the form sits on the right with a slim top bar (back + a link to
// the Classic look) and the legal links underneath. Phones get the form only,
// with the mark in the top bar.
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, CalendarCheck, CheckSquare, LineChart, Pause, Play, Wallet } from 'lucide-react';
import { Button } from '../../../components/ui-kit';
import { BrandLogo } from '../../../components/BrandMark';
import { SignedOutModern } from '../../signedOut';

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: 'Check in with one scan', body: 'Members scan the session QR on their phone. Attendance trends build themselves.' },
  { icon: CheckSquare, title: 'Build season, on one board', body: 'Assign work, set due dates and watch the robot come together, task by task.' },
  { icon: LineChart, title: 'Scout smarter', body: 'OPR, match predictions and alliance shortlists from live FTC data.' },
  { icon: Wallet, title: 'Every dollar accounted for', body: 'Sponsors, dues and spending in a ledger the whole team can read.' },
];

/** Live prefers-reduced-motion (read per mount, follows changes). */
function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

function Highlights() {
  const reduce = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  // Readers can pause the rotation; reduced motion keeps one highlight still.
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const running = !reduce && !paused && !hovered;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setI((n) => (n + 1) % HIGHLIGHTS.length), 5200);
    return () => clearInterval(t);
  }, [running, i]);
  const h = HIGHLIGHTS[i];
  return (
    <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="min-h-[148px]" aria-live={running ? 'off' : 'polite'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={h.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-background/60 backdrop-blur">
              <h.icon className="size-5 text-accent" />
            </span>
            <p className="mt-5 font-display text-2xl font-semibold tracking-tight">{h.title}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{h.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4 flex items-center gap-1">
        {HIGHLIGHTS.map((x, n) => (
          <button
            key={x.title}
            type="button"
            onClick={() => setI(n)}
            aria-label={`Show: ${x.title}`}
            aria-current={n === i ? 'true' : undefined}
            className="flex h-11 w-9 items-center"
          >
            <span className="block h-1 w-8 overflow-hidden rounded-full bg-foreground/10">
              {n === i && (
                running
                  ? <motion.span key={`run-${i}`} className="block h-full bg-accent" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 5.2, ease: 'linear' }} />
                  : <span className="block h-full w-full bg-accent" />
              )}
            </span>
          </button>
        ))}
        {!reduce && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play highlights' : 'Pause highlights'}
            className="ml-1 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-border bg-muted lg:flex lg:flex-col lg:justify-between lg:p-12">
      {/* Drifting light. Reduced motion keeps it still. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 size-[420px] rounded-full bg-accent/25 blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-[-80px] size-[380px] rounded-full bg-sky-400/15 blur-3xl"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--sh-foreground)_14%,transparent)_1px,transparent_0)] [background-size:22px_22px]"
      />
      <div className="relative flex items-center gap-3">
        <BrandLogo className="size-9 rounded-xl" />
        <span className="font-display text-lg font-semibold tracking-tight">Control Point</span>
      </div>
      <div className="relative">
        <Highlights />
      </div>
      <p className="relative text-xs text-muted-foreground">Mission control for robotics teams.</p>
    </aside>
  );
}

export function AuthLayout({ children, onBack, backLabel = 'Back', onClassic, wide }: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Switch this device back to the Classic look. */
  onClassic?: () => void;
  /** Wider form column (role picker). */
  wide?: boolean;
}) {
  return (
    <SignedOutModern>
      <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BrandPanel />
        <main className="flex min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex min-h-11 items-center justify-between gap-3">
            {onBack ? (
              <Button variant="ghost" onClick={onBack} className="-ml-2 h-11 px-3"><ArrowLeft /> {backLabel}</Button>
            ) : <span />}
            <div className="flex items-center gap-3">
              {onClassic && (
                <button type="button" onClick={onClassic} className="min-h-11 px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Use the Classic look
                </button>
              )}
              <BrandLogo className="size-8 rounded-lg lg:hidden" />
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center py-8">
            <motion.div
              className={wide ? 'w-full max-w-[520px]' : 'w-full max-w-[400px]'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {children}
            </motion.div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <a href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy</a>
            <a href="/terms" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</a>
          </nav>
        </main>
      </div>
    </SignedOutModern>
  );
}

/** Title block for a form column. */
export function AuthHeading({ title, description, icon }: { title: ReactNode; description?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-7">
      {icon && <div className="mb-5">{icon}</div>}
      <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Inline error under a form. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </motion.p>
  );
}

/** "or" divider between the form and the provider buttons. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />{label}<span className="h-px flex-1 bg-border" />
    </div>
  );
}
