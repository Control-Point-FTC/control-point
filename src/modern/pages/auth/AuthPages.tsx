// Modern sign-in, role choice, signup, OAuth completion and email check
// (phase 9b), on the shadcn kit inside the split AuthLayout. Same requests and
// rules as Classic through the shared hooks in components/auth/useAuthForms:
// login and setup still run in App, signup / OAuth / verify / reset run in the
// hooks. Text fields are drafted (not passwords), so going back a step or
// switching looks keeps them.
import { useId, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight, BadgeCheck, Check, Eye, EyeOff, GraduationCap, KeyRound, Loader2, Mail, ShieldCheck,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { oauthUrl } from '../../../services/api';
import { DiscordIcon, GithubIcon, GoogleIcon } from '../../../components/auth/ProviderIcons';
import {
  PROVIDER_LABEL, useForgotPassword, useOAuthSignup, useSignupForm, useTeamLookup, useVerifyEmail, type OAuthProvider,
} from '../../../components/auth/useAuthForms';
import { AuthHeading, AuthLayout, FormError, OrDivider } from './AuthLayout';

export type Providers = { google: boolean; discord: boolean; github: boolean };
const anyProvider = (p: Providers) => p.google || p.discord || p.github;
const PROVIDER_ICON: Record<OAuthProvider, () => ReactNode> = { google: GoogleIcon, discord: DiscordIcon, github: GithubIcon };

/** One field: label above, optional hint below. */
function Field({ label, hint, children, htmlFor, extra }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor: string; extra?: ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {extra}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, minLength }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} required minLength={minLength} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} className="h-11 pr-11" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-0 flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function ProviderButtons({ providers, intent }: { providers: Providers; intent: 'login' | 'signup' }) {
  const list = (['google', 'discord', 'github'] as OAuthProvider[]).filter((p) => providers[p]);
  return (
    <div className={cn('grid gap-2', list.length === 2 && 'sm:grid-cols-2', list.length === 3 && 'sm:grid-cols-3')}>
      {list.map((p) => {
        const Icon = PROVIDER_ICON[p];
        return (
          <Button key={p} asChild variant="outline" className="h-11">
            <a href={oauthUrl(`/api/auth/${p}?intent=${intent}`)} aria-label={`Continue with ${PROVIDER_LABEL[p]}`}>
              <Icon /> <span className={cn(list.length > 1 && 'sm:sr-only')}>{PROVIDER_LABEL[p]}</span>
            </a>
          </Button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign in (and first-time password setup)

export function SignInPage(p: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  needsSetup: boolean; error: string | null; busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  oauthError: string | null; providers: Providers;
  showForgot: boolean; setShowForgot: (v: boolean) => void; onPasswordReset: () => void;
  forgotStartAtCode?: boolean;
  onBack: () => void; onCreateAccount: () => void;
}) {
  const id = useId();
  return (
    <AuthLayout onBack={p.onBack} backLabel="Home">
      <AuthHeading
        title={p.needsSetup ? 'Set your password' : 'Welcome back'}
        description={p.needsSetup ? 'Choose a password to finish setting up your account.' : 'Sign in to your team workspace.'}
      />
      <form onSubmit={p.onSubmit} className="grid gap-5">
        {!p.needsSetup && (
          <Field label="Email" htmlFor={`${id}-email`}>
            <Input id={`${id}-email`} type="email" required autoComplete="email" value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="you@team.org" className="h-11" />
          </Field>
        )}
        <Field
          label={p.needsSetup ? 'New password' : 'Password'}
          htmlFor={`${id}-pw`}
          extra={!p.needsSetup && (
            <button type="button" onClick={() => p.setShowForgot(true)} className="min-h-11 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:min-h-0">
              Forgot password?
            </button>
          )}
        >
          <PasswordInput id={`${id}-pw`} value={p.password} onChange={p.setPassword} placeholder="••••••••" autoComplete={p.needsSetup ? 'new-password' : 'current-password'} />
        </Field>
        {p.error && <FormError>{p.error}</FormError>}
        <Button type="submit" size="lg" disabled={p.busy} className="h-11 w-full">
          {p.busy ? <><Loader2 className="animate-spin" /> Signing in…</> : p.needsSetup ? 'Complete setup' : <>Sign in <ArrowRight /></>}
        </Button>
      </form>
      {p.oauthError && !p.needsSetup && <div className="mt-4"><FormError>{p.oauthError}</FormError></div>}
      {anyProvider(p.providers) && !p.needsSetup && (
        <>
          <OrDivider label="or continue with" />
          <ProviderButtons providers={p.providers} intent="login" />
        </>
      )}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to Control Point?{' '}
        <button type="button" onClick={p.onCreateAccount} className="font-medium text-foreground underline-offset-4 hover:underline">Create an account</button>
      </p>
      {p.showForgot && !p.needsSetup && (
        <ForgotPasswordDialog initialEmail={p.email} setup={p.forgotStartAtCode} onClose={() => p.setShowForgot(false)} onDone={p.onPasswordReset} />
      )}
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
// Forgot password (dialog over sign-in)

function ForgotPasswordDialog({ initialEmail, setup = false, onClose, onDone }: { initialEmail: string; setup?: boolean; onClose: () => void; onDone: () => void }) {
  // `setup`: a password-less account signing in — the code is already sent.
  const f = useForgotPassword({ initialEmail, onDone, initialStep: setup ? 'code' : 'email' });
  const id = useId();
  const steps = ['email', 'code', 'password'] as const;
  const at = steps.indexOf(f.step);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{f.step === 'email' ? 'Reset your password' : f.step === 'code' ? 'Check your inbox' : setup ? 'Choose your password' : 'Choose a new password'}</DialogTitle>
          <DialogDescription>
            {f.step === 'email' && "Enter your account email and we'll send you a 6-digit code."}
            {f.step === 'code' && <>We sent a 6-digit code to <span className="font-medium text-foreground">{f.email}</span>.</>}
            {f.step === 'password' && 'Enter the code from the email, then set a new password.'}
          </DialogDescription>
        </DialogHeader>
        <ol className="flex gap-1.5" aria-label={`Step ${at + 1} of 3`}>
          {steps.map((s, i) => (
            <li key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <motion.span className="block h-full bg-accent" initial={false} animate={{ width: i <= at ? '100%' : '0%' }} transition={{ duration: 0.3 }} />
            </li>
          ))}
        </ol>
        {f.step === 'email' && (
          <form onSubmit={f.sendCode} className="grid gap-4">
            <Field label="Email" htmlFor={`${id}-email`}>
              <Input id={`${id}-email`} type="email" required autoComplete="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@team.org" className="h-11" />
            </Field>
            {f.error && <FormError>{f.error}</FormError>}
            <Button type="submit" disabled={f.busy} className="h-11">{f.busy ? 'Sending…' : 'Send code'}</Button>
          </form>
        )}
        {f.step === 'code' && (
          <form onSubmit={f.continueFromCode} className="grid gap-4">
            <CodeInput label="Reset code" value={f.code} onChange={f.setCode} />
            {f.error && <FormError>{f.error}</FormError>}
            <Button type="submit" className="h-11">Continue</Button>
            <Resend cooldown={f.cooldown} resending={f.resending} onResend={f.resend} />
          </form>
        )}
        {f.step === 'password' && (
          <form onSubmit={f.resetPassword} className="grid gap-4">
            <CodeInput label="Reset code" value={f.code} onChange={f.setCode} />
            <Field label="New password" htmlFor={`${id}-new`}>
              <PasswordInput id={`${id}-new`} value={f.password} onChange={f.setPassword} placeholder="6+ characters" autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" htmlFor={`${id}-confirm`}>
              <Input id={`${id}-confirm`} type="password" required value={f.confirm} onChange={(e) => f.setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" className="h-11" />
            </Field>
            {f.error && <FormError>{f.error}</FormError>}
            <Button type="submit" disabled={f.busy} className="h-11">{f.busy ? 'Updating…' : 'Update password'}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Six boxes over one real input (paste and one-time-code autofill work). */
function CodeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <input
          id={id}
          required
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        <div className="pointer-events-none grid grid-cols-6 gap-2" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => {
            const active = focused && (i === value.length || (i === 5 && value.length === 6));
            return (
              <div
                key={i}
                className={cn(
                  'flex h-12 items-center justify-center rounded-lg border bg-background font-mono text-xl font-semibold tabular-nums transition-colors',
                  active ? 'border-accent ring-2 ring-accent/30' : 'border-input',
                )}
              >
                {value[i] ? (
                  <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>{value[i]}</motion.span>
                ) : active ? <span className="h-5 w-px animate-pulse bg-foreground" /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Resend({ cooldown, resending, onResend }: { cooldown: number; resending: boolean; onResend: () => void }) {
  return (
    <p className="text-center text-xs text-muted-foreground">
      {cooldown > 0 ? `Resend code in ${cooldown}s` : (
        <button type="button" onClick={onResend} disabled={resending} className="min-h-11 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50">
          {resending ? 'Sending…' : "Didn't get it? Resend code"}
        </button>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Email check after signup / first login

export function VerifyEmailPage({ email, onBack, onVerified }: {
  email: string; onBack: () => void; onVerified: (data: any) => void;
}) {
  const v = useVerifyEmail({ email, onVerified });
  return (
    <AuthLayout onBack={onBack}>
      <AuthHeading
        icon={<IconTile><Mail className="size-5" /></IconTile>}
        title="Check your inbox"
        description={<>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it to verify your account.</>}
      />
      <form onSubmit={v.submit} className="grid gap-5">
        <CodeInput label="Verification code" value={v.code} onChange={v.setCode} />
        {v.error && <FormError>{v.error}</FormError>}
        <Button type="submit" size="lg" disabled={v.busy} className="h-11">{v.busy ? 'Verifying…' : 'Verify email'}</Button>
        <Resend cooldown={v.cooldown} resending={v.resending} onResend={v.resend} />
      </form>
    </AuthLayout>
  );
}

function IconTile({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'sky' }) {
  return (
    <span className={cn('inline-flex size-11 items-center justify-center rounded-xl border', tone === 'accent' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-sky-400/30 bg-sky-400/10 text-sky-400')}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Role choice

const ROLES = [
  { mode: 'admin' as const, icon: ShieldCheck, tone: 'accent' as const, title: "I'm a team admin", body: "Create your team's workspace. You'll get an access code to share with your members.", points: ['Verified with your FTC team number', 'Invite with one code'] },
  { mode: 'student' as const, icon: GraduationCap, tone: 'sky' as const, title: "I'm joining a team", body: 'Use the access code from your team admin to join their workspace.', points: ['Takes under a minute', 'Your admin sets your role'] },
];

export function RolePage({ onBack, onSelect, providers }: {
  onBack: () => void; onSelect: (mode: 'admin' | 'student') => void; providers: Providers;
}) {
  return (
    <AuthLayout onBack={onBack} backLabel="Home" wide>
      <AuthHeading title="Create your account" description="How will you use Control Point?" />
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLES.map((r, i) => (
          <motion.button
            key={r.mode}
            type="button"
            onClick={() => onSelect(r.mode)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.06 }}
            whileHover={{ y: -2 }}
            className="group flex flex-col rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <IconTile tone={r.tone}><r.icon className="size-5" /></IconTile>
            <span className="mt-4 font-display text-lg font-semibold tracking-tight">{r.title}</span>
            <span className="mt-1.5 text-sm text-muted-foreground">{r.body}</span>
            <ul className="mt-4 grid gap-1.5 text-xs text-muted-foreground">
              {r.points.map((pt) => <li key={pt} className="flex items-center gap-1.5"><Check className="size-3.5 text-success" />{pt}</li>)}
            </ul>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-foreground">
              Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </motion.button>
        ))}
      </div>
      {anyProvider(providers) && (
        <>
          <OrDivider label="or sign up with" />
          <ProviderButtons providers={providers} intent="signup" />
          <p className="mt-2 text-center text-xs text-muted-foreground">You'll pick admin or member right after.</p>
        </>
      )}
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
// FTC team number (admins) / access code (members)

function TeamNumberField({ teamNumber, setTeamNumber, teamName, setTeamName }: {
  teamNumber: string; setTeamNumber: (v: string) => void; teamName: string; setTeamName: (v: string) => void;
}) {
  const t = useTeamLookup({ teamNumber, setTeamNumber, teamName, setTeamName });
  const id = useId();
  return (
    <>
      <Field label="FTC team number" htmlFor={`${id}-num`}>
        <div className="relative">
          <Input id={`${id}-num`} required inputMode="numeric" value={teamNumber} onChange={(e) => t.onNumChange(e.target.value)} placeholder="e.g. 4215" className="h-11 pr-10 font-mono" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            {t.lookup === 'loading' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {t.lookup === 'found' && <BadgeCheck className="size-4 text-success" />}
          </span>
        </div>
      </Field>
      <div aria-live="polite">
        {t.lookup === 'loading' && <p className="text-xs text-muted-foreground">Looking up your team…</p>}
        {t.lookup === 'found' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-3">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t.foundName}</p>
                {t.foundSchool && <p className="truncate text-xs text-muted-foreground">{t.foundSchool}</p>}
                <p className="mt-0.5 text-xs font-medium text-success">Verified FTC team</p>
              </div>
            </div>
          </motion.div>
        )}
        {(t.lookup === 'notfound' || t.lookup === 'error') && !t.manual && (
          <p className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            {t.lookup === 'notfound' ? "We couldn't find that number in the FTC database." : "The team lookup isn't reachable right now."}{' '}
            <button type="button" onClick={() => t.setManual(true)} className="font-medium text-foreground underline underline-offset-4">Enter your team name instead</button>
          </p>
        )}
      </div>
      {t.manual && (
        <Field
          label="Team name"
          htmlFor={`${id}-name`}
          hint={t.lookup !== 'idle' && <button type="button" onClick={t.retry} className="font-medium text-foreground underline-offset-4 hover:underline">Try the number lookup again</button>}
        >
          <Input id={`${id}-name`} required value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Circuit Breakers" className="h-11" />
        </Field>
      )}
    </>
  );
}

function AccessCodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field label="Team access code" htmlFor={id} hint="Your team admin can find it in Settings.">
      <div className="relative">
        <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} required value={value} onChange={(e) => onChange(e.target.value)} placeholder="CP-XXXX-XXXX" className="h-11 pl-9 font-mono uppercase tracking-wider" />
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Email signup

export function SignupPage({ mode, onBack, onSignup, onDone, onSignIn }: {
  mode: 'admin' | 'student';
  onBack: () => void; onSignup: (payload: any) => Promise<any>; onDone: (data: any) => void;
  onSignIn: () => void;
}) {
  const f = useSignupForm({ mode, onSignup, onDone });
  const id = useId();
  const admin = mode === 'admin';
  return (
    <AuthLayout onBack={onBack} backLabel="Change role">
      <AuthHeading
        icon={<IconTile tone={admin ? 'accent' : 'sky'}>{admin ? <ShieldCheck className="size-5" /> : <GraduationCap className="size-5" />}</IconTile>}
        title={admin ? 'Create your workspace' : 'Join your team'}
        description={admin ? 'Set up your team and get an access code for your members.' : 'Enter the access code from your team admin.'}
      />
      <form onSubmit={f.submit} className="grid gap-5">
        <fieldset disabled={f.busy} className="grid gap-5">
          <Field label="Full name" htmlFor={`${id}-name`}>
            <Input id={`${id}-name`} required autoComplete="name" value={f.name} onChange={(e) => f.setName(e.target.value)} placeholder="Ada Lovelace" className="h-11" />
          </Field>
          <Field label="Email" htmlFor={`${id}-email`}>
            <Input id={`${id}-email`} type="email" required autoComplete="email" value={f.email} onChange={(e) => f.setEmail(e.target.value)} placeholder="you@team.org" className="h-11" />
          </Field>
          <Field label="Password" htmlFor={`${id}-pw`} hint="At least 6 characters.">
            <PasswordInput id={`${id}-pw`} value={f.password} onChange={f.setPassword} placeholder="••••••••" autoComplete="new-password" minLength={6} />
          </Field>
          {admin
            ? <TeamNumberField teamNumber={f.teamNumber} setTeamNumber={f.setTeamNumber} teamName={f.teamName} setTeamName={f.setTeamName} />
            : <AccessCodeField value={f.accessCode} onChange={f.setAccessCode} />}
        </fieldset>
        {f.error && <FormError>{f.error}</FormError>}
        <Button type="submit" size="lg" disabled={f.busy} className="h-11">
          {f.busy ? <><Loader2 className="animate-spin" /> Creating account…</> : admin ? 'Create workspace' : 'Join team'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <button type="button" onClick={onSignIn} className="font-medium text-foreground underline-offset-4 hover:underline">Sign in</button>
      </p>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
// Finish an OAuth signup

export function OAuthSignupPage({ token, intent, provider, onBack, onDone }: {
  token: string; intent: 'admin_signup' | 'student_signup' | 'signup'; provider: OAuthProvider;
  onBack: () => void; onDone: (data: any) => void;
}) {
  const f = useOAuthSignup({ token, intent, provider, onDone });
  const Icon = PROVIDER_ICON[provider];
  return (
    <AuthLayout onBack={onBack} backLabel="Home">
      <AuthHeading
        icon={<span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card"><Icon /></span>}
        title="One more step"
        description={`You're signed in with ${PROVIDER_LABEL[provider]}. Tell us about your team to finish.`}
      />
      <form onSubmit={f.submit} className="grid gap-5">
        <fieldset disabled={f.busy} className="grid gap-5">
          {f.needsRole && (
            <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              {(['admin', 'student'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={f.pickedRole === r}
                  onClick={() => f.setPickedRole(r)}
                  className={cn('relative min-h-11 rounded-lg px-3 text-sm font-medium transition-colors', f.pickedRole === r ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {f.pickedRole === r && <motion.span layoutId="oauth-role" className="absolute inset-0 rounded-lg border border-border bg-background shadow-sm" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                  <span className="relative inline-flex items-center gap-1.5">
                    {r === 'admin' ? <ShieldCheck className="size-4" /> : <GraduationCap className="size-4" />}
                    {r === 'admin' ? 'Team admin' : 'Joining a team'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {f.isAdmin
            ? <TeamNumberField teamNumber={f.teamNumber} setTeamNumber={f.setTeamNumber} teamName={f.teamName} setTeamName={f.setTeamName} />
            : <AccessCodeField value={f.accessCode} onChange={f.setAccessCode} />}
        </fieldset>
        {f.error && <FormError>{f.error}</FormError>}
        <Button type="submit" size="lg" disabled={f.busy} className="h-11">
          {f.busy ? <><Loader2 className="animate-spin" /> Creating account…</> : f.isAdmin ? 'Create workspace' : 'Join team'}
        </Button>
      </form>
    </AuthLayout>
  );
}
