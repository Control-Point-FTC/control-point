import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Check, Compass, UserCircle, AlertTriangle, Sun, Moon, Palette } from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  cn,
  buildProfilePatch,
  validateProfileInput,
  type OnboardingState,
} from './onboardingState';
import { confirmDialog } from '../dialog';
import { useTheme } from '../../hooks/useTheme';

export interface SetupWizardProps {
  user: { name?: string; role?: string };
  initialStep?: 0 | 1 | 2 | 3;
  /** Current onboarding state (used to render accurate resume/summary info). */
  state: OnboardingState;
  /** Persist a partial onboarding state patch; resolves with the merged state. */
  onPatchState: (patch: Record<string, unknown>) => Promise<OnboardingState>;
  /** PATCH /api/profile; throws on failure. */
  onSaveProfile: (patch: { name: string; role: string }) => Promise<void>;
  /** Parent updates its user object after a successful profile save. */
  onProfileChanged: (name: string, role: string) => void;
  /** Start the tour; optional fromStep restarts it from the beginning (retake). */
  onStartTour: (fromStep?: number) => void;
  onClose: () => void;
}

const STEP_LABELS = ['Your profile', 'Appearance', 'Take the tour', 'All set'];

const inputClass =
  'w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all';

/** Direction-aware step choreography: forward slides in from the right and
 *  out to the left; back does the mirror. easeOutExpo for the glide. */
const wizardStepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: 56 * dir }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: -56 * dir }),
};
const STEP_GLIDE = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

export default function SetupWizard({
  user,
  initialStep = 0,
  state,
  onPatchState,
  onSaveProfile,
  onProfileChanged,
  onStartTour,
  onClose,
}: SetupWizardProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialStep);
  const [name, setName] = useState(user.name || '');
  const [role, setRole] = useState(user.role || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ profile: string; tour: string }>(() => ({
    profile: state.steps.profile.status,
    tour: state.steps.tour.status,
  }));
  const { theme, setTheme } = useTheme();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);

  // Direction-aware transitions, derived from step changes so every
  // navigation path (save, skip, back buttons) glides the right way.
  const stepRef = useRef(step);
  const [dir, setDir] = useState(1);
  useEffect(() => {
    setDir(step >= stepRef.current ? 1 : -1);
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    dirtyRef.current = name.trim() !== (user.name || '').trim() || role.trim() !== (user.role || '').trim();
  }, [name, role, user.name, user.role]);

  // Focus the dialog on open / step change; Esc asks before abandoning.
  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        void handleClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, role]);

  const handleClose = async () => {
    if (dirtyRef.current && step === 0) {
      const ok = await confirmDialog({
        title: 'Leave setup?',
        message: 'Your profile changes haven\u2019t been saved yet. You can finish setup anytime from your account menu.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    onClose();
  };

  const markStep = async (id: 'profile' | 'tour', status: 'done' | 'skipped') => {
    const now = new Date().toISOString();
    await onPatchState({ steps: { [id]: { status, updatedAt: now } } });
  };

  const saveProfile = async (skip: boolean) => {
    setError(null);
    setFieldError(null);
    if (skip) {
      setBusy(true);
      try {
        await markStep('profile', 'skipped');
        setSummary((s) => ({ ...s, profile: 'skipped' }));
        setStep(1);
      } catch (e: any) {
        setError(e?.message || 'Could not save. Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const v = validateProfileInput(name);
    if (v) {
      setFieldError(v);
      return;
    }
    setBusy(true);
    try {
      const patch = buildProfilePatch({ name: user.name, role: user.role }, { name, role });
      if (patch) {
        await onSaveProfile(patch);
        onProfileChanged(patch.name, patch.role);
      }
      await markStep('profile', 'done');
      setSummary((s) => ({ ...s, profile: 'done' }));
      setStep(1);
    } catch (e: any) {
      setError(e?.message || 'Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const skipTour = async () => {
    setBusy(true);
    setError(null);
    try {
      await markStep('tour', 'skipped');
      setSummary((s) => ({ ...s, tour: 'skipped' }));
      setStep(3);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <motion.button
        aria-label="Close setup"
        onClick={() => void handleClose()}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        tabIndex={-1}
        className="relative w-full sm:max-w-md bg-secondary border border-text-base/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 max-h-[92dvh] overflow-y-auto focus-visible:outline-none"
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-start justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                Setup · Step {step + 1} of 4
              </p>
              <h2 id="wizard-title" className="mt-1 font-display text-xl font-bold text-text-base">
                {STEP_LABELS[step]}
              </h2>
            </motion.div>
          </AnimatePresence>
          <button
            onClick={() => void handleClose()}
            aria-label="Close setup"
            className="p-1.5 -m-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step dots */}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn('h-1.5 flex-1 rounded-full transition-all duration-500 ease-out', i <= step ? 'bg-accent' : 'bg-text-base/10')}
            />
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5"
          >
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-rose-200">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-1 text-xs font-bold text-rose-300 hover:text-text-base"
              >
                Dismiss — you can retry
              </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={wizardStepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={STEP_GLIDE}
            className="mt-5"
          >
        {step === 0 && (
          <div>
            <p className="text-sm text-text-muted leading-relaxed">
              How should teammates see you? <span className="text-text-base/70 font-medium">Recommended</span> —
              you can change this anytime in My Profile.
            </p>
            <div className="mt-4 space-y-3.5">
              <div>
                <label htmlFor="wizard-name" className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">
                  Display name <span className="text-accent">*</span>
                </label>
                <input
                  id="wizard-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  maxLength={80}
                  autoComplete="name"
                  className={inputClass}
                />
                {fieldError && (
                  <p role="alert" className="mt-1.5 text-xs text-rose-400 font-medium">
                    {fieldError}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="wizard-role" className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">
                  Role or title <span className="text-text-muted/60 normal-case font-medium">(optional)</span>
                </label>
                <input
                  id="wizard-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Build Captain"
                  maxLength={80}
                  autoComplete="organization-title"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                onClick={() => void saveProfile(true)}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text-base disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                Skip
              </button>
              <button
                onClick={() => void saveProfile(false)}
                disabled={busy}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
              >
                {busy ? 'Saving…' : (
                  <>Save &amp; continue <ArrowRight className="w-4 h-4" strokeWidth={2.5} /></>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-3">
              <Palette className="w-6 h-6 text-accent" strokeWidth={2.25} />
            </div>
            <p className="text-sm text-text-muted leading-relaxed text-center">
              Pick how Control Point looks. It applies instantly — and you can
              change it anytime from the header.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Appearance">
              {/* Dark option */}
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                onClick={() => setTheme('dark')}
                className={cn(
                  'relative rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  theme === 'dark'
                    ? 'border-accent/70 ring-2 ring-accent/25 bg-accent/[0.06]'
                    : 'border-text-base/10 bg-text-base/[0.03] hover:border-text-base/25'
                )}
              >
                <span className="block rounded-xl overflow-hidden border border-text-base/10" aria-hidden="true">
                  <span className="block h-16 p-2" style={{ backgroundColor: '#09090b' }}>
                    <span className="block h-2 w-2/3 rounded-full mb-1.5" style={{ backgroundColor: '#ffc700' }} />
                    <span className="block h-1.5 w-full rounded-full mb-1" style={{ backgroundColor: '#26262c' }} />
                    <span className="block h-1.5 w-4/5 rounded-full" style={{ backgroundColor: '#26262c' }} />
                  </span>
                </span>
                <span className="mt-2.5 flex items-center gap-1.5 text-sm font-bold text-text-base">
                  <Moon className="w-4 h-4" /> Dark
                </span>
                <span className="block text-xs text-text-muted mt-0.5">Carbon black · default</span>
                {theme === 'dark' && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-accent-ink" strokeWidth={3} />
                  </span>
                )}
              </button>
              {/* Light option */}
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                onClick={() => setTheme('light')}
                className={cn(
                  'relative rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  theme === 'light'
                    ? 'border-accent/70 ring-2 ring-accent/25 bg-accent/[0.06]'
                    : 'border-text-base/10 bg-text-base/[0.03] hover:border-text-base/25'
                )}
              >
                <span className="block rounded-xl overflow-hidden border border-black/10" aria-hidden="true">
                  <span className="block h-16 p-2" style={{ backgroundColor: '#f4f4f2' }}>
                    <span className="block h-2 w-2/3 rounded-full mb-1.5" style={{ backgroundColor: '#ffc700' }} />
                    <span className="block h-1.5 w-full rounded-full mb-1" style={{ backgroundColor: '#d8d8d4' }} />
                    <span className="block h-1.5 w-4/5 rounded-full" style={{ backgroundColor: '#d8d8d4' }} />
                  </span>
                </span>
                <span className="mt-2.5 flex items-center gap-1.5 text-sm font-bold text-text-base">
                  <Sun className="w-4 h-4" /> Light
                </span>
                <span className="block text-xs text-text-muted mt-0.5">Bright &amp; airy</span>
                {theme === 'light' && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-accent-ink" strokeWidth={3} />
                  </span>
                )}
              </button>
            </div>
            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
              >
                Continue <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-3">
              <Compass className="w-6 h-6 text-accent" strokeWidth={2.25} />
            </div>
            {state.steps.tour.status === 'done' ? (
              <>
                <p className="text-sm text-text-muted leading-relaxed">
                  You&apos;ve already completed the tour — nice. Want a refresher?
                </p>
                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => onStartTour(0)}
                    disabled={busy}
                    className="w-full py-3 rounded-xl font-bold text-[15px] bg-accent text-accent-ink hover:brightness-105 active:scale-[0.99] disabled:opacity-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                  >
                    Retake the tour
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="w-full py-3 rounded-xl font-bold text-[15px] text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
            <p className="text-sm text-text-muted leading-relaxed">
              Take a quick interactive tour of the workspace — dashboard, attendance, tasks,
              messaging, and more. It only takes a minute.
            </p>
            <div className="mt-6 space-y-2">
              <button
                onClick={() => onStartTour()}
                disabled={busy}
                className="w-full py-3 rounded-xl font-bold text-[15px] bg-accent text-accent-ink hover:brightness-105 active:scale-[0.99] disabled:opacity-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
              >
                Start the tour
              </button>
              <button
                onClick={() => void skipTour()}
                disabled={busy}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {busy ? 'Saving…' : 'Maybe later'}
              </button>
            </div>
            <button
              onClick={() => setStep(1)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-base transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to appearance
            </button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-accent flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-accent-ink" strokeWidth={2.75} />
            </div>
            <h3 className="font-display text-lg font-bold text-text-base">Setup complete</h3>
            <ul className="mt-4 space-y-2 text-left">
              <li className="flex items-center gap-3 bg-text-base/[0.03] border border-text-base/[0.06] rounded-xl px-3.5 py-2.5">
                <UserCircle className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-sm text-text-base font-medium flex-1">Profile</span>
                <span className="text-xs font-bold text-text-muted uppercase tracking-wide">
                  {summary.profile === 'skipped' ? 'Skipped' : summary.profile === 'done' ? 'Done' : 'Pending'}
                </span>
              </li>
              <li className="flex items-center gap-3 bg-text-base/[0.03] border border-text-base/[0.06] rounded-xl px-3.5 py-2.5">
                <Compass className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-sm text-text-base font-medium flex-1">Tour</span>
                <span className="text-xs font-bold text-text-muted uppercase tracking-wide">
                  {summary.tour === 'skipped' ? 'Skipped' : summary.tour === 'done' ? 'Done' : 'Pending'}
                </span>
              </li>
            </ul>
            {(summary.profile === 'skipped' || summary.tour === 'skipped') && (
              <p className="mt-3 text-xs text-text-muted leading-relaxed">
                You skipped a step — no problem. Pick it up anytime from the setup card on your dashboard
                or your account menu.
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-6 w-full py-3 rounded-xl font-bold text-[15px] bg-accent text-accent-ink hover:brightness-105 active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
            >
              Start using Control Point
            </button>
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
    </MotionConfig>
  );
}
