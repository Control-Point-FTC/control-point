// Modern setup (phase 9c), over the shared useSetupWizard: the same four
// steps, saves and skip bookkeeping as Classic. A dialog with a vertical
// stepper on wide screens (a progress bar on phones). The look step also picks
// Modern or Classic; switching mid-setup carries on in Classic at the same
// step with the same typed name and role (they're drafted).
import { useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Compass, LayoutDashboard, Moon, Sun, UserCircle } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { useSetupWizard } from '../../../components/onboarding/useSetupWizard';
import type { SetupWizardProps } from '../../../components/onboarding/SetupWizard';
import { useInterfaceMode, type InterfaceMode } from '../../interfaceMode';
import { useDraft } from '../../drafts';
import { notify } from '../../../components/dialog';

const STEPS = [
  { title: 'Your profile', hint: 'Name and role' },
  { title: 'Your look', hint: 'Theme and layout' },
  { title: 'Take the tour', hint: 'One minute' },
  { title: 'All set', hint: 'Summary' },
];
const ease = [0.2, 0.8, 0.2, 1] as const;
const statusLabel = (s: string) => (s === 'done' ? 'Done' : s === 'skipped' ? 'Skipped' : 'Pending');

function Choice({ checked, onClick, title, hint, preview }: { checked: boolean; onClick: () => void; title: React.ReactNode; hint: string; preview: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'relative rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        checked ? 'border-accent bg-accent/5' : 'border-border hover:border-foreground/20',
      )}
    >
      <span className="block overflow-hidden rounded-lg border border-border" aria-hidden="true">{preview}</span>
      <span className="mt-2 flex items-center gap-1.5 text-sm font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
      {checked && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Check className="size-3.5" strokeWidth={3} />
        </motion.span>
      )}
    </button>
  );
}

const themePreview = (bg: string, line: string) => (
  <span className="block h-14 p-2" style={{ backgroundColor: bg }}>
    <span className="mb-1.5 block h-2 w-2/3 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
    <span className="mb-1 block h-1.5 w-full rounded-full" style={{ backgroundColor: line }} />
    <span className="block h-1.5 w-4/5 rounded-full" style={{ backgroundColor: line }} />
  </span>
);
const layoutPreview = (modern: boolean) => (
  <span className="flex h-14 gap-1 bg-muted p-1.5">
    <span className={cn('w-4 rounded-sm', modern ? 'bg-foreground/10' : 'bg-accent/40')} />
    <span className="flex flex-1 flex-col gap-1">
      <span className={cn('h-2 rounded-sm', modern ? 'w-1/2 bg-foreground/25' : 'w-full bg-foreground/15')} />
      <span className={cn('flex-1', modern ? 'rounded-md border border-foreground/15' : 'rounded-sm bg-foreground/10')} />
    </span>
  </span>
);

export function SetupDialog(props: SetupWizardProps) {
  // "Leave setup?" is asked inside this dialog: a separate dialog layered over
  // a modal Radix dialog can't take focus or clicks.
  const [ask, setAsk] = useState<((ok: boolean) => void) | null>(null);
  const confirmLeave = () => new Promise<boolean>((resolve) => setAsk(() => resolve));
  const answer = (ok: boolean) => { ask?.(ok); setAsk(null); };
  const w = useSetupWizard(props, confirmLeave);
  const { state, onStartTour } = props;

  return (
    <MotionConfig reducedMotion="user">
      <Dialog open onOpenChange={(o) => { if (o) return; if (ask) answer(false); else void w.handleClose(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-2xl">
          <div className="grid sm:grid-cols-[200px_1fr]">
            <nav aria-label="Setup steps" inert={!!ask} className="hidden border-r border-border bg-muted/50 p-5 sm:block">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Setup</p>
              <ol className="mt-4 grid gap-1">
                {STEPS.map((s, i) => {
                  const done = i < w.step;
                  const current = i === w.step;
                  return (
                    <li key={s.title} aria-current={current ? 'step' : undefined} className={cn('relative flex items-start gap-3 rounded-lg px-2 py-2', current && 'bg-background')}>
                      {current && <motion.span layoutId="setup-step" className="absolute inset-0 rounded-lg border border-border bg-background" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                      <span className={cn('relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold', done ? 'border-accent bg-accent text-accent-ink' : current ? 'border-accent text-accent' : 'border-border text-muted-foreground')}>
                        {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="relative z-10">
                        <span className={cn('block text-sm', current ? 'font-medium' : 'text-muted-foreground')}>{s.title}</span>
                        <span className="block text-xs text-muted-foreground">{s.hint}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </nav>
            <div className="relative min-w-0 p-6">
              <AnimatePresence>
                {ask && (
                  <motion.div
                    role="alertdialog"
                    aria-labelledby="setup-leave-title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-popover/95 p-6 backdrop-blur-sm"
                  >
                    <div className="max-w-xs text-center">
                      <p id="setup-leave-title" className="font-display text-lg font-semibold">Leave setup?</p>
                      <p className="mt-1.5 text-sm text-muted-foreground">Your profile changes haven&rsquo;t been saved yet. You can finish setup anytime from your account menu.</p>
                      <div className="mt-5 grid gap-2">
                        <Button onClick={() => answer(false)} autoFocus className="h-11">Keep editing</Button>
                        <Button variant="ghost" onClick={() => answer(true)} className="h-11">Leave</Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Covered while asking: no focus or clicks behind the question. */}
              <div inert={!!ask}>
              <div className="mb-4 flex gap-1 sm:hidden" aria-hidden="true">
                {STEPS.map((s, i) => <span key={s.title} className={cn('h-1 flex-1 rounded-full transition-colors', i <= w.step ? 'bg-accent' : 'bg-foreground/10')} />)}
              </div>
              <p className="text-xs text-muted-foreground">Step {w.step + 1} of 4</p>
              <DialogTitle className="mt-1 font-display text-xl font-semibold tracking-tight">{STEPS[w.step].title}</DialogTitle>
              <DialogDescription className="sr-only">Set up your profile, look and tour.</DialogDescription>
              {w.error && (
                <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <span>{w.error}</span>
                  <button type="button" onClick={() => w.setError(null)} className="shrink-0 text-xs font-medium underline-offset-4 hover:underline">Dismiss</button>
                </div>
              )}
              <AnimatePresence mode="wait" custom={w.dir} initial={false}>
                <motion.div
                  key={w.step}
                  custom={w.dir}
                  initial={{ opacity: 0, x: 24 * w.dir }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 * w.dir }}
                  transition={{ duration: 0.25, ease }}
                  className="mt-5"
                >
                  {w.step === 0 && (
                    <form onSubmit={(e) => { e.preventDefault(); void w.saveProfile(false); }} className="grid gap-4">
                      <p className="text-sm text-muted-foreground">How should teammates see you? You can change this anytime in your profile.</p>
                      <fieldset disabled={w.busy} className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="setup-name">Display name</Label>
                          <Input id="setup-name" value={w.name} onChange={(e) => w.setName(e.target.value)} placeholder="e.g. Alex Rivera" maxLength={80} autoComplete="name" className="h-11" aria-invalid={!!w.fieldError} />
                          {w.fieldError && <p role="alert" className="text-xs text-destructive">{w.fieldError}</p>}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="setup-role">Role or title <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input id="setup-role" value={w.role} onChange={(e) => w.setRole(e.target.value)} placeholder="e.g. Build captain" maxLength={80} autoComplete="organization-title" className="h-11" />
                        </div>
                      </fieldset>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Button type="button" variant="ghost" onClick={() => void w.saveProfile(true)} disabled={w.busy} className="h-11">Skip</Button>
                        <Button type="submit" disabled={w.busy} className="h-11">{w.busy ? 'Saving…' : <>Save and continue <ArrowRight /></>}</Button>
                      </div>
                    </form>
                  )}
                  {w.step === 1 && (
                    <div className="grid gap-5">
                      <div>
                        <p className="mb-2 text-sm font-medium">Theme</p>
                        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3">
                          <Choice checked={w.theme === 'dark'} onClick={() => w.setTheme('dark')} title={<><Moon className="size-4" /> Dark</>} hint="Easy on the eyes" preview={themePreview('#0a0a0b', '#27272a')} />
                          <Choice checked={w.theme === 'light'} onClick={() => w.setTheme('light')} title={<><Sun className="size-4" /> Light</>} hint="Bright and clear" preview={themePreview('#ffffff', '#e4e4e7')} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button variant="ghost" onClick={() => w.setStep(0)} className="h-11"><ArrowLeft /> Back</Button>
                        <Button onClick={() => w.setStep(2)} className="h-11">Continue <ArrowRight /></Button>
                      </div>
                    </div>
                  )}
                  {w.step === 2 && (
                    <div className="grid gap-4">
                      <div className="flex items-center gap-4 rounded-xl border border-border p-4">
                        <motion.span animate={{ rotate: [0, 12, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5 }} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                          <Compass className="size-5" />
                        </motion.span>
                        <p className="text-sm text-muted-foreground">
                          {state.steps.tour.status === 'done'
                            ? "You've already taken the tour. Want a refresher?"
                            : 'A quick, interactive look around: the dashboard, attendance, tasks, messaging and Bruno.'}
                        </p>
                      </div>
                      {state.steps.tour.status === 'done' ? (
                        <div className="grid gap-2">
                          <Button onClick={() => onStartTour(0)} disabled={w.busy} className="h-11">Retake the tour</Button>
                          <Button variant="ghost" onClick={() => w.setStep(3)} className="h-11">Continue</Button>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Button onClick={() => onStartTour()} disabled={w.busy} className="h-11">Start the tour</Button>
                          <Button variant="ghost" onClick={() => void w.skipTour()} disabled={w.busy} className="h-11">{w.busy ? 'Saving…' : 'Maybe later'}</Button>
                        </div>
                      )}
                      <Button variant="link" onClick={() => w.setStep(1)} className="justify-self-start text-muted-foreground"><ArrowLeft /> Back to your look</Button>
                    </div>
                  )}
                  {w.step === 3 && (
                    <div className="grid gap-4">
                      <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }} className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-ink">
                        <Check className="size-6" strokeWidth={2.75} />
                      </motion.span>
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {[{ icon: UserCircle, label: 'Profile', status: w.summary.profile }, { icon: Compass, label: 'Tour', status: w.summary.tour }].map((r) => (
                          <li key={r.label} className="flex items-center gap-3 px-4 py-3 text-sm">
                            <r.icon className="size-4 text-muted-foreground" />
                            <span className="flex-1">{r.label}</span>
                            <span className={cn('text-xs font-medium', r.status === 'done' ? 'text-success' : 'text-muted-foreground')}>{statusLabel(r.status)}</span>
                          </li>
                        ))}
                      </ul>
                      {(w.summary.profile === 'skipped' || w.summary.tour === 'skipped') && (
                        <p className="text-xs text-muted-foreground">You skipped a step. Pick it up anytime from the setup card on your dashboard or your account menu.</p>
                      )}
                      <Button size="lg" onClick={w.finish} className="h-11">Start using Control Point</Button>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MotionConfig>
  );
}
