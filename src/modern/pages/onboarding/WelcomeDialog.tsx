// Modern first-run welcome (phase 9c). Same choices as Classic (Get started →
// setup, or Skip for now), shown as a wide split card: a greeting over a slow
// aurora on the left, and on the right the three setup steps the person is
// about to walk through, so "Get started" says exactly what comes next.
import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Compass, Palette, UserCircle } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui-kit';
import { BrandLogo } from '../../../components/BrandMark';

const ease = [0.2, 0.8, 0.2, 1] as const;
const NEXT = [
  { icon: UserCircle, title: 'Your profile', body: 'Your name and role, so teammates know who you are.' },
  { icon: Palette, title: 'Your look', body: 'Dark or light, Modern or Classic. You can change it anytime.' },
  { icon: Compass, title: 'A one-minute tour', body: 'Where attendance, tasks, chat and Bruno live.' },
];

export function WelcomeDialog({ userName, onGetStarted, onSkip }: { userName?: string; onGetStarted: () => void; onSkip: () => void }) {
  const firstName = (userName || '').split(' ')[0];
  return (
    <MotionConfig reducedMotion="user">
      <Dialog open onOpenChange={(o) => { if (!o) onSkip(); }}>
        <DialogContent showClose={false} className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-3xl">
          <div className="grid md:grid-cols-[1.05fr_1fr]">
            <div className="relative overflow-hidden border-b border-border bg-muted p-6 sm:p-8 md:border-b-0 md:border-r">
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -left-16 -top-20 size-72 rounded-full bg-accent/30 blur-3xl"
                animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-24 -right-10 size-64 rounded-full bg-sky-400/20 blur-3xl"
                animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative flex h-full flex-col">
                <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}>
                  <BrandLogo className="size-12 rounded-xl" />
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: 0.1 }}>
                  <DialogTitle className="mt-8 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                    {firstName ? <>Welcome,<br />{firstName}.</> : <>Welcome to<br />Control Point.</>}
                  </DialogTitle>
                  <DialogDescription className="mt-3 text-sm leading-relaxed">
                    Mission control for robotics teams: your meetings, build season and team chat in one workspace.
                  </DialogDescription>
                </motion.div>
                <p className="mt-auto pt-8 text-xs text-muted-foreground">Nothing is required. You can explore right away and finish setup later from your account menu.</p>
              </div>
            </div>
            <div className="flex flex-col p-6 sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Up next</p>
              <ol className="relative mt-4 grid gap-5">
                <span aria-hidden="true" className="absolute bottom-5 left-[19px] top-5 w-px bg-border" />
                {NEXT.map((n, i) => (
                  <motion.li
                    key={n.title}
                    className="relative flex gap-4"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease, delay: 0.2 + i * 0.08 }}
                  >
                    <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <n.icon className="size-4 text-accent" />
                    </span>
                    <span className="pt-1.5">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                    </span>
                  </motion.li>
                ))}
              </ol>
              <div className="mt-8 grid gap-2 sm:mt-auto sm:pt-8">
                <Button size="lg" onClick={onGetStarted} autoFocus className="group h-11">
                  Get started <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button variant="ghost" onClick={onSkip} className="h-11">Skip for now</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MotionConfig>
  );
}
