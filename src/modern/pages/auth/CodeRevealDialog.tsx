// Modern "workspace ready" moment (phase 9b): shown once to a new admin right
// after signup with the access code to share. A dialog over the (already
// loaded) workspace instead of a full-screen card; the code is copyable and
// shown as separate characters so it's easy to read out loud.
import { useState } from 'react';
import { motion } from 'motion/react';
import { BadgeCheck, Check, Copy, PartyPopper } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui-kit';
import { copyText } from '../../../components/copyText';

export function CodeRevealDialog({ team, onEnter }: { team: { name: string; access_code: string; verified?: boolean }; onEnter: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = async () => {
    const ok = await copyText(team.access_code);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(null), 2000);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onEnter(); }}>
      <DialogContent className="sm:max-w-md" showClose={false}>
        <DialogHeader className="items-center text-center sm:text-center">
          <motion.span
            initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.6 }}
            className="mb-2 inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-ink"
          >
            <PartyPopper className="size-6" />
          </motion.span>
          <DialogTitle className="text-xl">Your workspace is ready</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{team.name}</span> is set up.
            {team.verified && <span className="ml-1.5 inline-flex items-center gap-1 align-middle font-medium text-success"><BadgeCheck className="size-4" /> Verified FTC team</span>}
            {' '}Share this code with your members. They enter it when they sign up and join straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
          <p className="text-center text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Team access code</p>
          <p className="mt-3 flex flex-wrap justify-center gap-1 font-mono text-xl font-semibold sm:text-2xl" aria-label={team.access_code}>
            {team.access_code.split('').map((ch, i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.03 }}
                className={ch === '-' ? 'px-0.5 text-muted-foreground' : 'inline-flex h-10 min-w-7 items-center justify-center rounded-md border border-border bg-background px-1 text-accent'}
              >
                {ch}
              </motion.span>
            ))}
          </p>
          <Button variant="outline" onClick={copy} className="mt-4 h-11 w-full">
            {copied ? <><Check className="text-success" /> Copied</> : <><Copy /> Copy code</>}
          </Button>
          {copied === false && <p role="alert" className="mt-2 text-center text-xs text-destructive">Couldn't copy. Select the code and copy it by hand.</p>}
        </div>
        <Button onClick={onEnter} size="lg" className="h-11 w-full">Enter workspace</Button>
      </DialogContent>
    </Dialog>
  );
}
