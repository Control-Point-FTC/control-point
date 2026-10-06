import { X, ArrowLeft, ArrowRight, Check, PartyPopper } from 'lucide-react';
import { cn, type TourStep } from './onboardingState';
import { useWalkthrough } from './useWalkthrough';

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

export default function Walkthrough(props: WalkthroughProps) {
  const { steps, onFinish } = props;
  const {
    shownIndex, step, isComplete, goTo, exit, tooltipRef, instant, cardAnim,
    ringGeom, ringTransition, showRing, tooltipClass, tooltipStyle, progressPct,
  } = useWalkthrough(props);

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
