import { Bolt, CalendarCheck, CheckSquare, MessageSquare, ArrowRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] min-h-dvh bg-primary flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-lg">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-welcome-title"
          className="bg-secondary border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/50 text-center"
        >
          <div className="mx-auto w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-5">
            <Bolt className="w-8 h-8 text-accent-ink" strokeWidth={2.5} />
          </div>
          <h1 id="onboarding-welcome-title" className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome to Control Point'}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            Control Point is mission control for <strong className="text-white">robotics clubs and teams</strong> —
            everything your team needs for the season, in one workspace.
          </p>

          <ul className="mt-6 space-y-3 text-left">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
                <span className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                  <h.icon className="w-[18px] h-[18px] text-accent" strokeWidth={2.25} />
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{h.title}</span>
                  <span className="block text-[13px] text-text-muted mt-0.5 leading-relaxed">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-7 space-y-2.5">
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
                'w-full py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:text-white transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60'
              )}
            >
              Skip for now
            </button>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-text-muted/80">
            Nothing is required — you can explore right away and finish setup later.
            The tour is always available from your account menu.
          </p>
        </div>
      </div>
    </div>
  );
}
