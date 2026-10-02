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

// ---------------------------------------------------------------------------
// Choreography constants. The tour runs as a three-beat sequence per step:
//   1. tooltip fades/slides out (LEAVE_MS) while the target smooth-scrolls
//   2. spotlight ring morphs to the new target (MORPH_MS, easeOutExpo)
//   3. tooltip glides + fades/slides in, staggered behind the ring
// ---------------------------------------------------------------------------
const LEAVE_MS = 240;
const MORPH_MS = 700;
const SETTLE_MS = 200;
const EASE_CINEMATIC = 'cubic-bezier(0.22, 1, 0.36, 1)';

// jsdom / unit tests: run the state machine with zero choreography so
// assertions stay deterministic. Real browsers get the full cinematic path.
const IS_TEST_ENV =
  typeof process !== 'undefined' && (process as any).env?.NODE_ENV === 'test';

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

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
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

const clampStep = (n: number, len: number) => Math.max(0, Math.min(n, len));

export default function Walkthrough({ steps, initialStep = 0, onStepChange, onFinish, onExit }: WalkthroughProps) {
  const isMobile = useIsMobile();
  const prefersReduced = usePrefersReducedMotion();
  // Instant mode: reduced motion or unit tests — same state machine, no timers.
  const instant = prefersReduced || IS_TEST_ENV;

  // shownIndex drives visible content; targetRef tracks the latest requested
  // step so rapid Next/Back presses retarget cleanly mid-transition.
  const [shownIndex, setShownIndex] = useState(() => clampStep(initialStep, steps.length));
  const shownRef = useRef(shownIndex);
  const targetRef = useRef(shownIndex);
  const [placement, setPlacement] = useState<TooltipPlacement>({ kind: 'center' });
  // Spotlight geometry (last known) + visibility are separate so the ring can
  // fade out while keeping its shape, and morph between shapes via CSS.
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [spotVisible, setSpotVisible] = useState(false);
  // While morphing, geometry transitions slowly (cinematic); otherwise the
  // ring tracks scrolling tightly (glue).
  const [morphing, setMorphing] = useState(false);
  const [cardAnim, setCardAnim] = useState<'in' | 'out'>('in');

  const tooltipRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef(0);
  const morphTimer = useRef(0);
  const retryTimer = useRef(0);
  const settleTimer = useRef(0);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  const clearPending = useCallback(() => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (morphTimer.current) window.clearTimeout(morphTimer.current);
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    leaveTimer.current = morphTimer.current = retryTimer.current = settleTimer.current = 0;
  }, []);
  useEffect(() => clearPending, [clearPending]);

  const measurePlacement = useCallback(
    (rect: Rect | null): TooltipPlacement =>
      computeTooltipPosition(rect, window.innerWidth, window.innerHeight, isMobileRef.current),
    []
  );

  // Commit a step: resolve its target, morph the spotlight, glide the tooltip.
  const enterStep = useCallback(
    (i: number, attempt = 0) => {
      const step = steps[i];
      const el = step ? resolveTarget(step) : null;
      if (!el) {
        // Target may not be mounted yet (drawer still opening, route
        // transitioning) — retry briefly before falling back to centered.
        if (step?.target && attempt < 3 && !instant) {
          retryTimer.current = window.setTimeout(() => enterStep(i, attempt + 1), 250 * (attempt + 1));
          return;
        }
        setSpotVisible(false);
        setPlacement(measurePlacement(null));
      } else {
        const rect = toRect(el);
        setSpotRect(rect);
        setSpotVisible(true);
        setPlacement(measurePlacement(rect));
        if (!instant) {
          setMorphing(true);
          if (morphTimer.current) window.clearTimeout(morphTimer.current);
          morphTimer.current = window.setTimeout(() => setMorphing(false), MORPH_MS);
        }
      }
      setCardAnim('in');
      // Focus the tooltip for screen readers / keyboard users without
      // re-scrolling the page we just positioned.
      requestAnimationFrame(() => tooltipRef.current?.focus({ preventScroll: true }));
    },
    [steps, instant, measurePlacement]
  );

  const commitStep = useCallback(
    (i: number) => {
      shownRef.current = i;
      setShownIndex(i);
      onStepChange?.(i);
      enterStep(i);
    },
    [enterStep, onStepChange]
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = clampStep(next, steps.length);
      if (clamped === targetRef.current) return;
      targetRef.current = clamped;
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      if (instant) {
        commitStep(clamped);
        return;
      }
      // Beat 1: tooltip exits while the new target smooth-scrolls into view.
      setCardAnim('out');
      const el = steps[clamped] ? resolveTarget(steps[clamped]) : null;
      try {
        el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      } catch {
        /* noop */
      }
      // Beat 2+3: swap content, morph spotlight, tooltip follows.
      leaveTimer.current = window.setTimeout(() => commitStep(clamped), LEAVE_MS);
    },
    [steps, instant, commitStep]
  );

  const exit = useCallback(() => {
    clearPending();
    onExit();
  }, [clearPending, onExit]);

  // Initial mount: fade the first card + spotlight in.
  useEffect(() => {
    enterStep(shownRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the spotlight glued to its target on scroll/resize (one measurement
  // per frame). Once scrolling settles, re-derive the tooltip placement so it
  // glides to the corrected spot instead of jumping.
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const i = shownRef.current;
        const step = steps[i];
        const el = step ? resolveTarget(step) : null;
        if (!el) return;
        setSpotRect(toRect(el));
        if (settleTimer.current) window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => {
          if (shownRef.current !== i) return;
          const el2 = steps[i] ? resolveTarget(steps[i]) : null;
          setPlacement(measurePlacement(el2 ? toRect(el2) : null));
        }, SETTLE_MS);
      });
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, [steps, measurePlacement]);

  // Keyboard: Esc exits, arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        exit();
      } else if (e.key === 'ArrowRight') {
        goTo(targetRef.current + 1);
      } else if (e.key === 'ArrowLeft') {
        goTo(targetRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [goTo, exit]);

  const isComplete = shownIndex >= steps.length;
  const step = isComplete ? null : steps[shownIndex];
  const showRing = spotVisible && !!spotRect && placement.kind === 'anchored';

  const ringTransition = instant
    ? 'none'
    : morphing
      ? `top ${MORPH_MS}ms ${EASE_CINEMATIC}, left ${MORPH_MS}ms ${EASE_CINEMATIC}, width ${MORPH_MS}ms ${EASE_CINEMATIC}, height ${MORPH_MS}ms ${EASE_CINEMATIC}, opacity 300ms ease`
      : 'top 140ms linear, left 140ms linear, width 140ms linear, height 140ms linear, opacity 300ms ease';

  const ringGeom = spotRect
    ? {
        top: spotRect.top - 8,
        left: spotRect.left - 8,
        width: spotRect.width + 16,
        height: spotRect.height + 16,
      }
    : undefined;

  const tooltipTransition =
    instant || placement.kind !== 'anchored'
      ? undefined
      : `top 550ms ${EASE_CINEMATIC}, left 550ms ${EASE_CINEMATIC}, width 550ms ${EASE_CINEMATIC}`;

  const tooltipStyle: React.CSSProperties = { transition: tooltipTransition };
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

  const progressPct = steps.length ? Math.max(((shownIndex + 1) / steps.length) * 100, 8) : 100;

  return (
    <div data-onboard="walkthrough-root">
      <style>{`
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tour-card-out {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(10px) scale(0.98); }
        }
        @keyframes tour-spot-pulse {
          0%, 100% { box-shadow: 0 0 16px 2px rgba(255,199,0,0.25); }
          50% { box-shadow: 0 0 36px 8px rgba(255,199,0,0.55); }
        }
        .tour-card-in { animation: tour-card-in 0.38s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .tour-card-out { animation: tour-card-out 0.22s ease-in both; }
        .tour-spot-pulse { animation: tour-spot-pulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tour-card-in, .tour-card-out, .tour-spot-pulse { animation: none !important; }
        }
      `}</style>

      {/* Spotlight: dim layer with animated cutout + volt glow ring (non-interactive) */}
      {ringGeom && (
        <>
          <div
            aria-hidden="true"
            className="fixed z-[79] pointer-events-none"
            style={{
              ...ringGeom,
              borderRadius: 16,
              boxShadow: '0 0 0 9999px rgba(3,3,5,0.55)',
              transition: ringTransition,
              opacity: showRing ? 1 : 0,
            }}
          />
          <div
            aria-hidden="true"
            className={cn('fixed z-[79] pointer-events-none', !instant && 'tour-spot-pulse')}
            style={{
              ...ringGeom,
              borderRadius: 18,
              border: '2px solid #FFC700',
              transition: ringTransition,
              opacity: showRing ? 1 : 0,
            }}
          />
        </>
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
        <div className={cn(!instant && (cardAnim === 'in' ? 'tour-card-in' : 'tour-card-out'))}>
          <div className="bg-secondary border border-text-base/10 rounded-2xl shadow-2xl shadow-black/60 p-5 sm:p-6">
            {isComplete ? (
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
                  <PartyPopper className="w-6 h-6 text-accent-ink" strokeWidth={2.25} />
                </div>
                <h2 id="tour-title" className="font-display text-xl font-bold text-text-base">
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
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    Explore on my own
                  </button>
                </div>
              </div>
            ) : (
              step && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                      Step {shownIndex + 1} of {steps.length}
                    </p>
                    <div
                      className="flex items-center gap-1.5"
                      role="group"
                      aria-label="Tour steps"
                    >
                      {steps.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => goTo(i)}
                          aria-label={`Go to step ${i + 1}: ${s.title}`}
                          aria-current={i === shownIndex ? 'step' : undefined}
                          className={cn(
                            'h-1.5 rounded-full transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                            i === shownIndex
                              ? 'w-6 bg-accent'
                              : i < shownIndex
                                ? 'w-1.5 bg-accent/50 hover:bg-accent/80'
                                : 'w-1.5 bg-text-base/20 hover:bg-text-base/40'
                          )}
                        />
                      ))}
                    </div>
                    <button
                      onClick={exit}
                      aria-label="Exit tour"
                      className="p-1.5 -m-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div
                    className="mt-2 h-1.5 rounded-full bg-text-base/10 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={steps.length}
                    aria-valuenow={shownIndex + 1}
                    aria-label={`Tour progress: step ${shownIndex + 1} of ${steps.length}`}
                  >
                    <div
                      className="h-full bg-accent rounded-full transition-[width] duration-500 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <h2 id="tour-title" className="mt-3 font-display text-lg font-bold text-text-base">
                    {step.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{step.body}</p>
                  <div className="mt-5 flex items-center justify-between gap-2">
                    <button
                      onClick={() => goTo(shownIndex - 1)}
                      disabled={shownIndex === 0}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base disabled:opacity-30 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={exit}
                      className="px-3 py-2.5 rounded-xl text-sm font-medium text-text-muted/80 hover:text-text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      Skip tour
                    </button>
                    <button
                      onClick={() => goTo(shownIndex + 1)}
                      autoFocus
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                    >
                      {shownIndex === steps.length - 1 ? (
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
    </div>
  );
}
