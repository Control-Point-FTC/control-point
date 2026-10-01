import { useState, useEffect } from 'react';
import { ChevronLeft, Mail } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Card, Button, Input } from '../ui';
import { apiFetch } from '../../services/api';

// Email ownership check for email+password signups: the server sent a 6-digit
// code to this address. No session exists until the code is confirmed.
export default function VerifyEmailScreen({ email, onBack, onVerified }: {
  email: string;
  onBack: () => void;
  onVerified: (data: any) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      onVerified(data);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.alreadyVerified) { setError('This email is already verified — try signing in.'); return; }
      if (!res.ok) throw new Error(data.error || "Couldn't resend the code");
      setCooldown(data.cooldownSeconds || 60);
    } catch (err: any) {
      setError(err.message || "Couldn't resend the code");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-white transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <Card className="p-8">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Mail className="text-accent w-8 h-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Check your inbox</h1>
          <p className="text-text-muted text-sm">
            We sent a 6-digit code to <span className="text-white font-semibold">{email}</span>.
            Enter it below to verify your account.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input
            required
            aria-label="Verification code"
            value={code}
            onChange={(e: any) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="text-center text-2xl font-mono tracking-[0.5em] py-3"
          />
          {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full py-3 text-[15px]">
            {busy ? 'Verifying…' : 'Verify email'}
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
      </Card>
    </AuthShell>
  );
}
