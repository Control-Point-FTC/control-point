// Modern zero-team screen (phase 9e), over the shared useTeamless (same
// create / join / delete-account rules as Classic). Two option cards open
// their form in place; deleting the account sits in a separate danger zone
// that needs your email typed before the final confirmation.
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, KeyRound, LogOut, Plus, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button, Input, Label } from '../../../components/ui-kit';
import { DialogHost } from '../../../components/dialog';
import { useTeamless } from '../../../components/auth/useTeamless';
import { AuthHeading, AuthLayout } from './AuthLayout';

const OPTIONS = [
  { id: 'create' as const, icon: Plus, title: 'Create a workspace', body: "Start your team's space. You'll get an access code to share." },
  { id: 'join' as const, icon: KeyRound, title: 'Join with a code', body: 'Use the access code from your team admin.' },
];

export function TeamlessPage({ user, onCreateTeam, onJoinTeam, onDeleteAccount, onSignOut, onClassic }: {
  user: any;
  onCreateTeam: (name: string) => Promise<void>;
  onJoinTeam: (accessCode: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onSignOut: () => void;
  onClassic: () => void;
}) {
  const t = useTeamless({ user, onCreateTeam, onJoinTeam, onDeleteAccount });
  return (
    <AuthLayout onClassic={onClassic} wide>
      <DialogHost />
      <AuthHeading
        title="You're not on a team yet"
        description={<>{user?.email && <>Signed in as <span className="font-medium text-foreground">{user.email}</span>. </>}Create a workspace or join your team's.</>}
      />
      <div className="grid gap-3">
        {OPTIONS.map((o) => {
          const open = t.mode === o.id;
          return (
            <div key={o.id} className={cn('rounded-2xl border bg-card transition-colors', open ? 'border-accent/60' : 'border-border')}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => t.setMode(open ? 'menu' : o.id)}
                className="flex min-h-11 w-full items-center gap-4 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background"><o.icon className="size-5 text-accent" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{o.title}</span>
                  <span className="block text-sm text-muted-foreground">{o.body}</span>
                </span>
                <ArrowRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.form
                    key="form"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                    onSubmit={(e) => { e.preventDefault(); void (o.id === 'create' ? t.doCreate() : t.doJoin()); }}
                  >
                    <div className="grid gap-3 border-t border-border p-4">
                      {o.id === 'create' ? (
                        <div className="grid gap-2">
                          <Label htmlFor="teamless-name">Team name</Label>
                          <Input id="teamless-name" value={t.teamName} onChange={(e) => t.setTeamName(e.target.value)} placeholder="e.g. Hypnotic Robotics" autoFocus className="h-11" />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label htmlFor="teamless-code">Access code</Label>
                          <Input id="teamless-code" value={t.code} onChange={(e) => t.setCode(e.target.value)} placeholder="CP-XXXX-XXXX" autoFocus className="h-11 font-mono uppercase tracking-wider" />
                        </div>
                      )}
                      <Button type="submit" disabled={t.busy || !(o.id === 'create' ? t.teamName.trim() : t.code.trim())} className="h-11">
                        {o.id === 'create' ? (t.busy ? 'Creating…' : 'Create workspace') : (t.busy ? 'Joining…' : 'Join team')}
                      </Button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onSignOut} className="h-11"><LogOut /> Sign out</Button>
        <Button variant="ghost" onClick={() => t.setMode(t.mode === 'delete' ? 'menu' : 'delete')} aria-expanded={t.mode === 'delete'} className="h-11 text-muted-foreground hover:text-destructive">
          <Trash2 /> Delete my account
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {t.mode === 'delete' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form
              onSubmit={(e) => { e.preventDefault(); void t.doDelete(); }}
              className="mt-3 grid gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4"
            >
              <p className="text-sm">This can't be undone. Type <span className="font-medium">{user?.email}</span> to confirm.</p>
              <Label htmlFor="teamless-confirm" className="sr-only">Your email</Label>
              <Input id="teamless-confirm" value={t.confirmEmail} onChange={(e) => t.setConfirmEmail(e.target.value)} placeholder="your@email.com" autoComplete="off" className="h-11" />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => { t.setMode('menu'); t.setConfirmEmail(''); }} className="h-11 flex-1">Cancel</Button>
                <Button type="submit" variant="destructive" disabled={t.busy || !t.emailMatches} className="h-11 flex-1">{t.busy ? 'Deleting…' : 'Delete account'}</Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
