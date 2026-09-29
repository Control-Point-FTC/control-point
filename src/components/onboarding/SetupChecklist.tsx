import { Check, Circle, Sparkles, X } from 'lucide-react';
import { cn, checklistItems, type OnboardingState } from './onboardingState';

interface SetupChecklistProps {
  state: OnboardingState;
  onContinue: () => void;
  onDismiss: () => void;
}

/**
 * Non-intrusive "Complete your setup" card for the dashboard. Shown only while
 * setup is incomplete and the user hasn't dismissed it. Dismissing never marks
 * steps complete — it just hides the reminder (reopenable from the account menu).
 */
export default function SetupChecklist({ state, onContinue, onDismiss }: SetupChecklistProps) {
  const items = checklistItems(state);
  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <section
      aria-labelledby="setup-checklist-title"
      className="bg-secondary border border-accent/25 rounded-3xl p-5 sm:p-6 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/70 via-accent to-accent/70" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-[18px] h-[18px] text-accent" strokeWidth={2.25} />
          </span>
          <div>
            <h2 id="setup-checklist-title" className="font-display text-base font-bold text-white">
              Complete your setup
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {doneCount} of {items.length} done — pick up where you left off.
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss setup reminder"
          className="p-1.5 -m-1 rounded-lg text-text-muted hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3.5 py-2.5"
          >
            {item.status === 'done' ? (
              <Check className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" strokeWidth={2.75} aria-label="Done" />
            ) : (
              <Circle className="w-5 h-5 text-text-muted/50 flex-shrink-0 mt-0.5" aria-label="Not done" />
            )}
            <span>
              <span className={cn('block text-sm font-semibold', item.status === 'done' ? 'text-text-muted line-through' : 'text-white')}>
                {item.title}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">{item.description}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        onClick={onContinue}
        className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
      >
        Continue setup
      </button>
    </section>
  );
}
