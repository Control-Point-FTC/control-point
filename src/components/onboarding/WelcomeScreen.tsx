import { Bolt, CalendarCheck, CheckSquare, MessageSquare, ArrowRight } from 'lucide-react';
import { motion, MotionConfig } from 'motion/react';
import { cn } from './onboardingState';

interface WelcomeScreenProps {
  userName?: string;
  onGetStarted: () => void;
  onSkip: () => void;
}

const HIGHLIGHTS = [
  { icon: CalendarCheck, title: 'Run your meetings', body: 'QR check-ins, shared calendar, attendance history.' },
  { icon: CheckSquare, title: 'Ship the season', body: 'Tasks, build tracking, budget, and inventory.' },
  { icon: MessageSquare, title: 'Keep everyone in sync', body: 'Team chat, announcements, and outreach stats.' },
];

export default function WelcomeScreen({ userName, onGetStarted, onSkip }: WelcomeScreenProps) {
  const firstName = (userName || '').split(' ')[0];
  return (
    <MotionConfig reducedMotion="user">
    <div className="fixed inset-0 z-[100] min-h-dvh bg-primary flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 44, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-welcome-title"
          className="bg-secondary border border-text-base/10 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/50 text-center"
        >
          <motion.div
            className="mx-auto w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-5"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.1 }}
          >
            <Bolt className="w-8 h-8 text-accent-ink" strokeWidth={2.5} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
          >
          <h1 id="onboarding-welcome-title" className="font-display text-2xl sm:text-3xl font-bold text-text-base tracking-tight">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome to Control Point'}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            Control Point is mission control for <strong className="text-text-base">robotics clubs and teams</strong> —
            everything your team needs for the season, in one workspace.
          </p>
          </motion.div>

          <ul className="mt-6 space-y-3 text-left">
            {HIGHLIGHTS.map((h, i) => (
              <motion.li
                key={h.title}
                className="flex items-start gap-3 bg-text-base/[0.03] border border-text-base/[0.06] rounded-2xl p-3.5"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.24 + i * 0.09 }}
              >
                <span className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                  <h.icon className="w-[18px] h-[18px] text-accent" strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-text-base">{h.title}</span>
                  <span className="block text-[13px] text-text-muted mt-0.5 leading-relaxed">{h.body}</span>
                </span>
              </motion.li>
            ))}
          </ul>

          <motion.div
            className="mt-7 space-y-2.5"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.52 }}
          >
            <button
              onClick={onGetStarted}
              autoFocus
              className={cn(
                'w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2',
                'bg-accent text-accent-ink hover:brightness-105 active:scale-[0.99] transition-all',
                'shadow-[0_4px_16px_rgba(255,199,0,0.25)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary'
              )}
            >
              Get Started <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
            </button>
            <button
              onClick={onSkip}
              className={cn(
                'w-full py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
              )}
            >
              Skip for now
            </button>
          </motion.div>

          <motion.p
            className="mt-5 text-xs leading-relaxed text-text-muted/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.66 }}
          >
            Nothing is required — you can explore right away and finish setup later.
            The tour is always available from your account menu.
          </motion.p>
        </div>
      </motion.div>
    </div>
    </MotionConfig>
  );
}
