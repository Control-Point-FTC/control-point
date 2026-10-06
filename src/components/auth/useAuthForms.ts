// Shared controllers for the signed-out screens (2026 redesign, phase 9b).
// Legacy and Modern render the same hooks, so both send the same requests with
// the same rules. Text fields are kept in the shared draft store, so going back
// a step or switching the look keeps what was typed. Passwords are never
// drafted. Drafts are cleared on sign-in (persistSession).
import { useEffect, useRef, useState } from 'react';
import { apiFetch, apiUrl } from '../../services/api';
import { useDraft } from '../../modern/drafts';

export type TeamLookup = 'idle' | 'loading' | 'found' | 'notfound' | 'error';

/**
 * Admin signup: the FTC team number is checked against the official FTC record
 * and the team name is filled in from it. Falls back to a typed name when the
 * number isn't an FTC team (or the lookup is down).
 */
export function useTeamLookup({ teamNumber, setTeamNumber, teamName, setTeamName }: {
  teamNumber: string;
  teamName: string;
  setTeamNumber: (v: string) => void;
  setTeamName: (v: string) => void;
}) {
  const [lookup, setLookup] = useState<TeamLookup>('idle');
  const [foundName, setFoundName] = useState('');
  const [foundSchool, setFoundSchool] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const timer = useRef<any>(null);
  // Only the newest lookup may fill the name (typing fast fires several).
  const seq = useRef(0);

  // `restoring`: re-checking a drafted number on return. A typed team name
  // from that earlier visit is kept (and its field shown) if the number
  // still isn't an FTC team.
  const doLookup = async (num: string, restoring = false) => {
    const n = num.trim();
    const id = ++seq.current;
    if (!/^\d+$/.test(n)) {
      setLookup('idle'); setFoundName(''); setFoundSchool(null);
      return;
    }
    setLookup('loading');
    try {
      const res = await fetch(apiUrl(`/api/ftc/lookup-public?number=${encodeURIComponent(n)}`));
      if (id !== seq.current) return;
      if (res.ok) {
        const data = await res.json();
        if (id !== seq.current) return;
        setFoundName(data.name || '');
        setFoundSchool(data.schoolName || null);
        setLookup('found');
        setManual(false);
        setTeamName(data.name || '');
      } else {
        setLookup('notfound');
        setFoundName('');
        keepOrClearName(restoring);
      }
    } catch {
      if (id !== seq.current) return;
      setLookup('error');
      keepOrClearName(restoring);
    }
  };

  const keepOrClearName = (restoring: boolean) => {
    if (restoring && teamName.trim()) setManual(true);
    else setTeamName('');
  };

  const onNumChange = (v: string) => {
    setTeamNumber(v);
    if (timer.current) clearTimeout(timer.current);
    // Any edit retires the previous answer at once, so a reply for the old
    // number can't land (and look verified) during the next delay.
    seq.current++;
    if (foundName || lookup === 'found') { setFoundName(''); setFoundSchool(null); setTeamName(''); }
    if (!v.trim()) {
      setLookup('idle'); setFoundName(''); setFoundSchool(null); setTeamName('');
      return;
    }
    setLookup('idle');
    timer.current = setTimeout(() => doLookup(v), 600);
  };

  // A drafted number brought back from an earlier visit: look it up again so
  // the verified name shows (and the name field is filled) without retyping.
  useEffect(() => {
    if (teamNumber.trim()) void doLookup(teamNumber, true);
    return () => { if (timer.current) clearTimeout(timer.current); seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => { setManual(false); setTeamName(''); void doLookup(teamNumber); };

  return { lookup, foundName, foundSchool, manual, setManual, onNumChange, retry };
}

/** Email + password signup for a new admin (creates a team) or student (joins one). */
export function useSignupForm({ mode, onSignup, onDone }: {
  mode: 'admin' | 'student';
  onSignup: (payload: any) => Promise<any>;
  onDone: (data: any) => void;
}) {
  const k = (f: string) => `auth:signup:${mode}:${f}`;
  const [name, setName] = useDraft(k('name'), '');
  const [email, setEmail] = useDraft(k('email'), '');
  const [teamName, setTeamName] = useDraft(k('team-name'), '');
  const [teamNumber, setTeamNumber] = useDraft(k('team-number'), '');
  const [accessCode, setAccessCode] = useDraft(k('access-code'), '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await onSignup({
        accountType: mode, name, email, password,
        teamName, teamNumber, accessCode,
      });
      onDone(data);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  return {
    name, setName, email, setEmail, password, setPassword, showPw, setShowPw,
    teamName, setTeamName, teamNumber, setTeamNumber, accessCode, setAccessCode,
    error, busy, submit,
  };
}

export type OAuthProvider = 'google' | 'discord' | 'github';
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', discord: 'Discord', github: 'GitHub' };

/** After OAuth: the identity is verified; collect the role-specific details. */
export function useOAuthSignup({ token, intent, provider, onDone }: {
  token: string;
  intent: 'admin_signup' | 'student_signup' | 'signup';
  provider: OAuthProvider;
  onDone: (data: any) => void;
}) {
  const needsRole = intent === 'signup';
  const k = (f: string) => `auth:oauth-signup:${f}`;
  const [pickedRole, setPickedRole] = useDraft<'admin' | 'student'>(k('role'), 'student');
  const isAdmin = intent === 'admin_signup' || (needsRole && pickedRole === 'admin');
  const [teamName, setTeamName] = useDraft(k('team-name'), '');
  const [teamNumber, setTeamNumber] = useDraft(k('team-number'), '');
  const [accessCode, setAccessCode] = useDraft(k('access-code'), '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/oauth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token, teamName, teamNumber, accessCode, role: needsRole ? pickedRole : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      onDone(data);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  return {
    needsRole, pickedRole, setPickedRole, isAdmin,
    teamName, setTeamName, teamNumber, setTeamNumber, accessCode, setAccessCode,
    error, busy, submit,
  };
}

/** A resend cooldown that counts down once a second. */
function useCooldown(start: number) {
  const [cooldown, setCooldown] = useState(start);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  return [cooldown, setCooldown] as const;
}

const sixDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

/** Email ownership check for email + password signups (6-digit code). */
export function useVerifyEmail({ email, onVerified }: { email: string; onVerified: (data: any) => void }) {
  const [code, setCodeRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCooldown(60);
  const [resending, setResending] = useState(false);
  const setCode = (v: string) => setCodeRaw(sixDigits(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sixDigits(code);
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

  return { code, setCode, error, busy, cooldown, resending, submit, resend };
}

/** Forgot password: email → 6-digit code → new password. */
export function useForgotPassword({ initialEmail, onDone }: { initialEmail: string; onDone: () => void }) {
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCodeRaw] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useCooldown(0);
  const [resending, setResending] = useState(false);
  const setCode = (v: string) => setCodeRaw(sixDigits(v));

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
    if (sixDigits(code).length !== 6) { setError('Enter the 6-digit code from the email.'); return; }
    setError(null);
    setStep('password');
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sixDigits(code);
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
      // Code problems surface here (the code is validated together with the
      // new password), so send them back to the code step to retry.
      if (/code/i.test(msg)) setStep('code');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return {
    step, setStep, email, setEmail, code, setCode, password, setPassword, confirm, setConfirm,
    error, busy, cooldown, resending, sendCode, resend, continueFromCode, resetPassword,
  };
}
