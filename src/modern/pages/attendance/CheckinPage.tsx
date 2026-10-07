// Modern QR check-in (phase 9a): the page a member lands on after scanning
// the meeting QR code. Shared useQrCheckin (same session lookup, wrong-team
// guard and confirm as Legacy), shown as one focused card with an animated
// success state.
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { CalendarCheck, Check, Loader2, QrCode, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { useQrCheckin } from '../../../components/attendance/useQrCheckin';

export function CheckinPage({ currentUser, onRefresh }: { currentUser?: any; onRefresh?: () => void }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const { info, error, busy, done, confirm } = useQrCheckin(token, onRefresh);
  const state = error ? 'error' : done ? 'done' : !info ? 'loading' : !info.isMember ? 'wrong' : 'ask';
  const Icon = state === 'done' ? Check : state === 'error' || state === 'wrong' ? X : state === 'loading' ? Loader2 : QrCode;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center p-4">
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm"
        aria-live="polite"
      >
        <motion.span
          key={state}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className={cn('mx-auto mb-5 flex size-16 items-center justify-center rounded-full',
            state === 'done' ? 'bg-success/15 text-success' : state === 'error' || state === 'wrong' ? 'bg-destructive/10 text-destructive' : 'bg-accent/15 text-accent')}
        >
          <Icon className={cn('size-8', state === 'loading' && 'animate-spin motion-reduce:animate-none')} />
        </motion.span>
        {state === 'error' ? (
          <>
            <h1 className="font-display text-2xl font-semibold">Can't check in</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="mt-6 w-full">Back to dashboard</Button>
          </>
        ) : state === 'done' ? (
          <>
            <h1 className="font-display text-2xl font-semibold">You're checked in</h1>
            <p className="mt-2 text-sm text-muted-foreground">{info?.teamName} · {format(new Date(), 'EEEE, MMMM d')}</p>
            <Button onClick={() => navigate('/dashboard')} className="mt-6 w-full">Back to dashboard</Button>
          </>
        ) : state === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading session…</p>
        ) : state === 'wrong' ? (
          <>
            <h1 className="font-display text-2xl font-semibold">Wrong team</h1>
            <p className="mt-2 text-sm text-muted-foreground">You're signed in as {currentUser?.name}, who isn't on {info.teamName}.</p>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="mt-6 w-full">Back to dashboard</Button>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{info.teamName}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">Check in{info.memberName ? ` as ${info.memberName}` : ''}?</h1>
            <p className="mt-2 text-sm text-muted-foreground">Session ends {format(new Date(info.expiresAt), 'h:mm a')}</p>
            <Button size="lg" onClick={() => void confirm()} disabled={busy} className="mt-6 w-full"><CalendarCheck /> {busy ? 'Checking in…' : "Yes, I'm here"}</Button>
          </>
        )}
      </motion.section>
    </div>
  );
}
