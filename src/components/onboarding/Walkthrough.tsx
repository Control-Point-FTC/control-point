import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Check, PartyPopper } from 'lucide-react';
import {
  cn,
  computeTooltipPosition,
  type Rect,
  type TooltipPlacement,
  type TourStep,
} from './onboardingState';

export interface WalkthroughProps {
  steps: TourStep[];
  initialStep?: number;
  /** Fired when the visible step changes (parent persists resume position). */
  onStepChange?: (index: number) => void;
  /** Tour finished via the completion screen. */
  onFinish: (next: 'setup' | 'explore') => void;
  /** Tour closed before finishing. */
  onExit: () => void;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

function resolveTarget(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  const direct = document.querySelector(`[data-onboard="${step.target}"]`);
  if (direct instanceof HTMLElement) return direct;
  for (const alt of step.mobileTargets || []) {
    const el = document.querySelector(`[data-onboard="${alt}"]`);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

function toRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
}

export default function Walkthrough({ steps, initialStep = 0, onStepChange, onFinish, onExit }: WalkthroughProps) {
  const isMobile = useIsMobile();
  // index === steps.length means the completion screen.
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialStep, steps.length)));
  const [placement, setPlacement] = useState<TooltipPlacement>({ kind: 'center' });
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, steps.length));
      setIndex(clamped);
      onStepChange?.(clamped);
    },
    [steps.length, onStepChange]
  );

  // Resolve + measure the current step's target.
  const reposition = useCallback(() => {
    const step = steps[indexRef.current];
    if (!step) {
      setPlacement({ kind: 'center' });
      setTargetRect(null);
      return;
    }
    const el = resolveTarget(step);
    if (!el) {
      setPlacement(computeTooltipPosition(null, window.innerWidth, window.innerHeight, false));
      setTargetRect(null);
      return;
    }
    const rect = toRect(el);
    setTargetRect(rect);
    setPlacement(
      computeTooltipPosition(
        rect,
        window.innerWidth,
        window.innerHeight,
        window.matchMedia('(max-width: 767px)').matches
      )
    );
  }, [steps]);

  // On step change: scroll the target into view, then measure.
  useEffect(() => {
    const step = steps[index];
    const el = step ? resolveTarget(step) : null;
    if (el) {
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      } catch {
        /* noop */
      }
      const t = window.setTimeout(reposition, 350);
      // Focus the tooltip for screen readers / keyboard users.
      const f = window.setTimeout(() => tooltipRef.current?.focus(), 380);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(f);
      };
    }
    reposition();
    const f = window.setTimeout(() => tooltipRef.current?.focus(), 60);
    return () => window.clearTimeout(f);
  }, [index, steps, reposition]);

  // Keep the highlight glued to the target on scroll/resize/route change.
  useEffect(() => {
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition]);

  // Keyboard: Esc exits, arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onExit();
      } else if (e.key === 'ArrowRight') {
        goTo(indexRef.current + 1);
      } else if (e.key === 'ArrowLeft') {
        goTo(indexRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [goTo, onExit]);

  const isComplete = index >= steps.length;
  const step = isComplete ? null : steps[index];

  const tooltipStyle: React.CSSProperties = {};
  let tooltipClass = '';
  if (placement.kind === 'bottom-sheet') {
    tooltipClass = 'fixed left-3 right-3 bottom-3 z-[80]';
  } else if (placement.kind === 'center') {
    tooltipClass = 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-[min(380px,calc(100vw-2rem))]';
  } else {
    tooltipClass = 'fixed z-[80]';
    tooltipStyle.top = placement.top;
    tooltipStyle.left = placement.left;
    tooltipStyle.width = placement.width;
  }

  return (
    <div data-onboard="walkthrough-root">
      {/* Highlight ring (non-interactive, never blocks the app) */}
      {targetRect && placement.kind === 'anchored' && (
        <div
          aria-hidden="true"
          className="fixed z-[79] pointer-events-none rounded-2xl transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: '0 0 0 3px #FFC700, 0 0 24px rgba(255,199,0,0.45)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        tabIndex={-1}
        style={tooltipStyle}
        className={cn(tooltipClass, 'focus-visible:outline-none')}
      >
        <div className="bg-secondary border border-white/10 rounded-2xl shadow-2xl shadow-black/60 p-5 sm:p-6">
          {isComplete ? (
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
                <PartyPopper className="w-6 h-6 text-accent-ink" strokeWidth={2.25} />
              </div>
              <h2 id="tour-title" className="font-display text-xl font-bold text-white">
                You&apos;re ready!
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                You&apos;ve seen the highlights. Finish setting up your profile, or dive straight into your workspace —
                the tour stays available in your account menu.
              </p>
              <div className="mt-5 space-y-2">
                <button
                  onClick={() => onFinish('setup')}
                  className="w-full py-3 rounded-xl font-bold text-[15px] bg-accent text-accent-ink hover:brightness-105 active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                >
                  Continue setup
                </button>
                <button
                  onClick={() => onFinish('explore')}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Explore on my own
                </button>
              </div>
            </div>
          ) : (
            step && (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                    Step {index + 1} of {steps.length}
                  </p>
                  <button
                    onClick={onExit}
                    aria-label="Exit tour"
                    className="p-1.5 -m-1.5 rounded-lg text-text-muted hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div
                  className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuenow={index + 1}
                  aria-label={`Tour progress: step ${index + 1} of ${steps.length}`}
                >
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(((index + 1) / steps.length) * 100, 8)}%` }}
                  />
                </div>
                <h2 id="tour-title" className="mt-3 font-display text-lg font-bold text-white">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{step.body}</p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => goTo(index - 1)}
                    disabled={index === 0}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={onExit}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium text-text-muted/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    Skip tour
                  </button>
                  <button
                    onClick={() => goTo(index + 1)}
                    autoFocus
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                  >
                    {index === steps.length - 1 ? (
                      <>
                        Finish <Check className="w-4 h-4" strokeWidth={2.75} />
                      </>
                    ) : (
                      <>
                        Next <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )
          )}
          {/* Hidden progress mirror for the completion screen (a11y) */}
          {isComplete && (
            <div
              className="sr-only"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={steps.length}
              aria-label="Tour complete"
            />
          )}
        </div>
      </div>
    </div>
  );
}
