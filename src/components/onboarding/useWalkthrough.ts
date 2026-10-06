// Shared tour engine (2026 redesign): the step state machine, spotlight
// geometry and tooltip placement used by the Classic and Modern walkthroughs.
// Rendering lives in Walkthrough.tsx (Classic) and the Modern tour card.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeTooltipPosition,
  type Rect,
  type TooltipPlacement,
  type TourStep,
} from './onboardingState';
import type { WalkthroughProps } from './Walkthrough';
import { deleteDraft, getDraft, setDraft } from '../../modern/drafts';

// The step on screen, kept while the tour is open so a look switch (which
// swaps the Classic and Modern tour) carries on where the user was. App
// clears it when the tour closes.
const TOUR_STEP_KEY = 'onboarding:tour-step';
export function clearTourDraft() {
  deleteDraft(TOUR_STEP_KEY);
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

export function useWalkthrough({ steps, initialStep = 0, onStepChange, onExit }: WalkthroughProps) {
  const isMobile = useIsMobile();
  const prefersReduced = usePrefersReducedMotion();
  // Instant mode: reduced motion or unit tests — same state machine, no timers.
  const instant = prefersReduced || IS_TEST_ENV;

  // shownIndex drives visible content; targetRef tracks the latest requested
  // step so rapid Next/Back presses retarget cleanly mid-transition.
  const [shownIndex, setShownIndex] = useState(() => clampStep(getDraft<number>(TOUR_STEP_KEY, initialStep), steps.length));
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
      setDraft(TOUR_STEP_KEY, i);
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

  return {
    shownIndex, step, isComplete, goTo, exit, tooltipRef, instant, cardAnim, placement,
    ringGeom, ringTransition, showRing, tooltipClass, tooltipStyle, progressPct,
  };
}
