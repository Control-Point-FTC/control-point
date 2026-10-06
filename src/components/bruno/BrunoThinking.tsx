// Bruno's live "thinking" and "generating" states (Modern experience).
//
// Honest by design: the steps only describe what Bruno is actually given
// (the page you're on, attachments, scouting data, the conversation) — never
// invented reasoning. While waiting for the first token the block shows the
// steps with a shimmer and an elapsed timer; once text streams it collapses
// to "Thought for Ns" and a caret follows the generated text.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Check, ChevronDown } from 'lucide-react';
import { cn } from '../cn';

export interface ThinkingStep { id: string; label: string }

/** Steps Bruno really performs for this request. */
export function thinkingSteps(opts: { page?: string | null; images?: number; pdfs?: number; scouting?: boolean; history?: number }): ThinkingStep[] {
  const steps: ThinkingStep[] = [];
  if (opts.page) steps.push({ id: 'page', label: `Looking at ${opts.page}` });
  if (opts.images) steps.push({ id: 'img', label: `Reading ${opts.images} screenshot${opts.images === 1 ? '' : 's'}` });
  if (opts.pdfs) steps.push({ id: 'pdf', label: `Reading ${opts.pdfs} PDF${opts.pdfs === 1 ? '' : 's'}` });
  if (opts.scouting) steps.push({ id: 'scout', label: 'Pulling scouting data' });
  if ((opts.history ?? 0) > 1) steps.push({ id: 'hist', label: 'Recalling this conversation' });
  steps.push({ id: 'think', label: 'Thinking it through' });
  return steps;
}

function useElapsed(since: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);
  return since ? Math.max(0, (running ? now : now) - since) : 0;
}

/**
 * phase: 'thinking' (no text yet) | 'generating' (text streaming) | 'done'.
 * startedAt: when the request was sent. thoughtMs: time to first token.
 */
export function BrunoThinking({ steps, phase, startedAt, thoughtMs }: {
  steps: ThinkingStep[];
  phase: 'thinking' | 'generating' | 'done';
  startedAt: number | null;
  thoughtMs: number | null;
}) {
  const thinking = phase === 'thinking';
  const elapsed = useElapsed(startedAt, thinking);
  const [open, setOpen] = useState(false);
  // Reveal steps one by one while thinking (each ~700ms), all done afterwards.
  const shown = thinking ? Math.min(steps.length, 1 + Math.floor(elapsed / 700)) : steps.length;
  const secs = ((thinking ? elapsed : thoughtMs ?? 0) / 1000).toFixed(1);

  if (!thinking) {
    // Near-instant replies (cached, or an error message) have nothing to show.
    if ((thoughtMs ?? 0) < 500) return null;
    return (
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 text-xs text-text-muted hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Sparkles className="size-3.5 text-accent" />
          Thought for {secs}s
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden mt-1.5 space-y-1 border-l border-line pl-3"
            >
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs text-text-muted">
                  <Check className="size-3 text-success" /> {s.label}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="py-0.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
          <Sparkles className="relative size-3.5 text-accent" />
        </span>
        <span className="cp-shimmer-text font-medium">Thinking</span>
        <span className="tabular-nums text-text-muted">{secs}s</span>
      </div>
      <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
        <AnimatePresence initial={false}>
          {steps.slice(0, shown).map((s, i) => {
            const current = i === shown - 1;
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('flex items-center gap-2 text-xs', current ? 'text-text-base' : 'text-text-muted')}
              >
                {current
                  ? <span className="size-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" aria-hidden="true" />
                  : <Check className="size-3 text-success" />}
                {s.label}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

/** Blinking caret that follows streaming text. */
export function StreamingCaret() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-accent align-baseline animate-[cp-caret_1s_steps(2)_infinite]" aria-hidden="true" />;
}
