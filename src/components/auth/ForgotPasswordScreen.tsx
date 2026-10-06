import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Mail, KeyRound } from 'lucide-react';
import { Card, Button, Input } from '../ui';
import { apiFetch } from '../../services/api';

// Forgot password: email -> 6-digit OTP via Resend -> new password.
// Rendered as an overlay on top of the login form.
export default function ForgotPasswordScreen({ initialEmail, onBack, onDone }: {
  initialEmail: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

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

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean || !clean.includes('@')) { setError('Enter a valid email address.'); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't send the code");
      setStep('code');
      setCooldown(data.cooldownSeconds || 60);
    } catch (err: any) {
      setError(err.message || "Couldn't send the code — try again");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't resend the code");
      setCooldown(data.cooldownSeconds || 60);
    } catch (err: any) {
      setError(err.message || "Couldn't resend the code");
    } finally {
      setResending(false);
    }
  };

  // Code step: require all 6 digits before advancing. The server still
  // validates the code together with the new password.
  const continueFromCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setError(null);
    setStep('password');
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      setStep('code');
      return;
    }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: clean, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't reset your password");
      onDone();
    } catch (err: any) {
      const msg = err.message || "Couldn't reset your password — try again";
      // Code problems surface here (code is validated together with the new
      // password) — send them back to the code step so they can retry.
      if (/code/i.test(msg)) setStep('code');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

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
                onChange={(e: any) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                  onChange={(e: any) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
