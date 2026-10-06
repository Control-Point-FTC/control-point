// Modern walkthrough (phase 9c), over the shared useWalkthrough engine (same
// steps, targets, keyboard, resume position and finish choices as Classic).
// The spotlight is a soft cut-out with an accent outline; the card shows a
// progress ring with the step count, the step text sliding in per step, and a
// keyboard hint. The finish card offers Continue setup / Explore on my own.
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, PartyPopper, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { useWalkthrough } from '../../../components/onboarding/useWalkthrough';
import type { WalkthroughProps } from '../../../components/onboarding/Walkthrough';

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-foreground/10" />
        <motion.circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-accent" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </svg>
      <span className="text-[11px] font-semibold tabular-nums">{label}</span>
    </span>
  );
}

export function TourCard(props: WalkthroughProps) {
  const { steps, onFinish } = props;
  const t = useWalkthrough(props);
  const total = steps.length;

  return (
    <MotionConfig reducedMotion="user">
      <div data-onboard="walkthrough-root">
        {t.ringGeom && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[79] rounded-2xl"
            // One shadow stack: the accent outline, its glow, then the dim around it.
            style={{ ...t.ringGeom, boxShadow: '0 0 0 2px var(--color-accent), 0 0 24px 6px color-mix(in srgb, var(--color-accent) 40%, transparent), 0 0 0 9999px rgb(0 0 0 / 0.6)', transition: t.ringTransition, opacity: t.showRing ? 1 : 0 }}
          />
        )}
        <div
          ref={t.tooltipRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-title"
          tabIndex={-1}
          style={t.tooltipStyle}
          className={cn(t.tooltipClass, 'focus-visible:outline-none')}
        >
          <motion.div
            animate={{ opacity: t.cardAnim === 'in' ? 1 : 0, y: t.cardAnim === 'in' ? 0 : 8 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
          >
            {t.isComplete ? (
              <div className="p-5 sm:p-6">
                <motion.span initial={{ scale: 0.5, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5 }} className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-ink">
                  <PartyPopper className="size-5" />
                </motion.span>
                <h2 id="tour-title" className="mt-4 font-display text-lg font-semibold">You're ready</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">That's the tour. Finish setting up your profile, or dive straight in. The tour stays in your account menu.</p>
                <div className="mt-5 grid gap-2">
                  <Button onClick={() => onFinish('setup')} className="h-11">Continue setup</Button>
                  <Button variant="ghost" onClick={() => onFinish('explore')} className="h-11">Explore on my own</Button>
                </div>
                <div className="sr-only" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total} aria-label="Tour complete" />
              </div>
            ) : t.step && (
              <>
                <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                  <ProgressRing value={(t.shownIndex + 1) / total} label={`${t.shownIndex + 1}/${total}`} />
                  <div
                    className="min-w-0 flex-1"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={total}
                    aria-valuenow={t.shownIndex + 1}
                    aria-label={`Tour progress: step ${t.shownIndex + 1} of ${total}`}
                  >
                    <p className="text-xs text-muted-foreground">Tour</p>
                    <div className="mt-1 flex gap-1" role="group" aria-label="Tour steps">
                      {steps.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => t.goTo(i)}
                          aria-label={`Go to step ${i + 1}: ${s.title}`}
                          aria-current={i === t.shownIndex ? 'step' : undefined}
                          className="group flex h-6 flex-1 items-center focus-visible:outline-none"
                        >
                          <span className={cn('h-1 w-full rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-accent/60', i <= t.shownIndex ? 'bg-accent' : 'bg-foreground/10 group-hover:bg-foreground/25')} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={t.exit} aria-label="Exit tour" className="-mr-2 size-11"><X /></Button>
                </div>
                <div className="px-5 pb-5 pt-4">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={t.step.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
                      <h2 id="tour-title" className="font-display text-lg font-semibold">{t.step.title}</h2>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.step.body}</p>
                    </motion.div>
                  </AnimatePresence>
                  <div className="mt-5 flex items-center gap-2">
                    <Button variant="ghost" onClick={() => t.goTo(t.shownIndex - 1)} disabled={t.shownIndex === 0} className="h-11 px-3"><ArrowLeft /> Back</Button>
                    <Button variant="ghost" onClick={t.exit} className="h-11 px-3 text-muted-foreground">Skip tour</Button>
                    <Button onClick={() => t.goTo(t.shownIndex + 1)} autoFocus className="ml-auto h-11">
                      {t.shownIndex === total - 1 ? <>Finish <Check /></> : <>Next <ArrowRight /></>}
                    </Button>
                  </div>
                  <p className="mt-3 hidden text-xs text-muted-foreground sm:block">Use ← → to move, Esc to leave.</p>
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
