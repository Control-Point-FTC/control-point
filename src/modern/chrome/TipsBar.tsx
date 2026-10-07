// Persistent tips bar (owner spec): one line on every page, under the top
// bar, with a tip for the page you're on. It stays (no close); "Next tip"
// cycles through that page's tips and then the general ones.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';

const GENERAL = [
  'Press Ctrl K (⌘K on Mac) to jump anywhere or run an action.',
  'Ask Bruno about anything in your workspace — tasks, attendance, budget, matches.',
  'Found a bug? The bug button in the corner sends it straight to the team behind Control Point.',
];

const BY_PAGE: [prefix: string, tips: string[]][] = [
  ['/dashboard', ['Your dashboard shows what needs you today: check-in, tasks due and what’s next.']],
  ['/tasks', ['Drag a task between columns to change its status.', 'Paste a list into “Bruno” on Tasks to create many tasks at once.']],
  ['/calendar', ['Click a day to add an event; everyone sees it on their dashboard.']],
  ['/attendance', ['Show the QR code at practice: members scan it to check in.']],
  ['/chat', ['Type @ to mention someone, or @everyone to ping the whole team.']],
  ['/teams', ['Invite people with a link — it can expire, cap its uses or need approval.']],
  ['/roles', ['Roles bundle permissions; give someone “Invite people” without making them an admin.']],
  ['/stats', ['Scout works offline: entries save on this device and sync when you’re back online.', 'Analyze an event field to build your pick list.']],
  ['/predict', ['Predictions update as matches finish — percentages are calibrated, not guesses.']],
  ['/budget', ['Amounts over $10,000 ask for a second look before saving.']],
  ['/inventory', ['Keep parts and quantities here so anyone can see what the team has.']],
  ['/cad', ['Upload a STEP file under Snapshots to view the model right in the browser.']],
  ['/code', ['Connect a GitHub repo to browse your robot code here.']],
  ['/bruno', ['Bruno only knows what’s in your workspace — it says so when it doesn’t know.']],
  ['/settings', ['Light or dark: Settings → Appearance.']],
];

export function tipsFor(path: string): string[] {
  // "/cad" also covers its tabs ("/cad-snapshots", "/cad-docs", …).
  const page = BY_PAGE.find(([p]) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?') || path.startsWith(p + '-'))?.[1] || [];
  return [...page, ...GENERAL];
}

export function TipsBar({ path }: { path: string }) {
  const tips = useMemo(() => tipsFor(path), [path]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [path]);
  const tip = tips[i % tips.length];
  return (
    <div role="note" aria-label="Tip" className="flex min-h-9 items-center gap-2 border-b border-line bg-secondary/40 px-4 text-xs text-text-muted sm:px-6 lg:px-8">
      <Lightbulb className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate" title={tip} aria-live="polite">{tip}</p>
      {tips.length > 1 && (
        <button
          type="button"
          onClick={() => setI((n) => n + 1)}
          className="inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-md px-1.5 font-medium text-text-base hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          Next tip <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
