import { useEffect, useRef } from 'react';
import { ChevronLeft, Mail, KeyRound } from 'lucide-react';
import { Card, Button, Input } from '../ui';
import { useForgotPassword } from './useAuthForms';

// Forgot password: email -> 6-digit OTP via Resend -> new password.
// Rendered as an overlay on top of the login form.
export default function ForgotPasswordScreen({ initialEmail, onBack, onDone }: {
  initialEmail: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const {
    step, email, setEmail, code, setCode, password, setPassword, confirm, setConfirm,
    error, busy, cooldown, resending, sendCode, resend, continueFromCode, resetPassword,
  } = useForgotPassword({ initialEmail, onDone });

  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus into the dialog on open and on step change,
  // trap Tab inside while open, and restore focus to the trigger on close.
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((el) => el.offsetParent !== null);
    // Focus the first input (or button) on each step change.
    const first = focusables()[0];
    if (first) first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onBack(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (triggerRef.current && document.contains(triggerRef.current)) {
        triggerRef.current.focus();
      }
    };
  }, [step, onBack]);

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Reset password">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onBack} aria-hidden="true" />
      <div ref={dialogRef} className="relative w-full max-w-md my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <button
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-base transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to sign in
        </button>
        <Card className="p-8">
          <div className="flex flex-col items-center gap-3 mb-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
              {step === 'password' ? <KeyRound className="text-accent w-8 h-8" strokeWidth={2.5} /> : <Mail className="text-accent w-8 h-8" strokeWidth={2.5} />}
            </div>
            <h1 className="text-2xl font-display font-bold text-text-base tracking-tight">
              {step === 'email' && 'Reset your password'}
              {step === 'code' && 'Check your inbox'}
              {step === 'password' && 'Choose a new password'}
            </h1>
            <p className="text-text-muted text-sm">
              {step === 'email' && "Enter your account email and we'll send you a 6-digit code."}
              {step === 'code' && <>We sent a 6-digit code to <span className="text-text-base font-semibold">{email}</span>.</>}
              {step === 'password' && "Enter the code from the email, then set a new password."}
            </p>
          </div>

          {step === 'email' && (
            <form onSubmit={sendCode} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Email</label>
                <Input type="email" required value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="you@team.org" autoComplete="email" />
              </div>
              {error && <p className="text-sm text-rose-400 text-center" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full py-3 text-[15px]">
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={continueFromCode} className="space-y-4">
              <Input
                required
                aria-label="Reset code"
                value={code}
                onChange={(e: any) => setCode(e.target.value)}
                placeholder="••••••"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="text-center text-2xl font-mono tracking-[0.5em] py-3"
              />
              {error && <p className="text-sm text-rose-400 text-center" role="alert">{error}</p>}
              <Button type="submit" className="w-full py-3 text-[15px]">
                Continue
              </Button>
              <div className="text-center">
                {cooldown > 0 ? (
                  <p className="text-xs text-text-muted">Resend code in {cooldown}s</p>
                ) : (
                  <button type="button" onClick={resend} disabled={resending} className="text-xs font-semibold text-accent hover:brightness-110 disabled:opacity-50">
                    {resending ? 'Sending…' : "Didn't get it? Resend code"}
                  </button>
                )}
              </div>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={resetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Reset code</label>
                <Input
                  required
                  aria-label="Reset code"
                  value={code}
                  onChange={(e: any) => setCode(e.target.value)}
                  placeholder="••••••"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="text-center text-xl font-mono tracking-[0.5em] py-2.5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">New password</label>
                <Input type="password" required value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Confirm password</label>
                <Input type="password" required value={confirm} onChange={(e: any) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
              {error && <p className="text-sm text-rose-400 text-center" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full py-3 text-[15px]">
                {busy ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
