// Modern "What's new" (phase 9e): the same changelog and seen-version rule as
// Classic, as a kit dialog. A version rail on the left (wide screens) jumps
// between releases; each release shows New / Improved / Fixed with icons.
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Bug, Sparkles, Wrench } from 'lucide-react';
import { cn } from '../../components/cn';
import { Badge, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui-kit';
import { CHANGELOG, CURRENT_VERSION, type ChangelogEntry } from '../../utils/changelog';
import { markVersionSeen } from '../../components/WhatsNewModal';

const SECTIONS = [
  { key: 'added' as const, label: 'New', icon: Sparkles, cls: 'text-accent' },
  { key: 'improved' as const, label: 'Improved', icon: Wrench, cls: 'text-sky-500' },
  { key: 'fixed' as const, label: 'Fixed', icon: Bug, cls: 'text-success' },
];

function Release({ entry }: { entry: ChangelogEntry }) {
  return (
    <motion.article key={entry.version} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <p className="text-xs text-muted-foreground">v{entry.version} · {entry.date}</p>
      <h3 className="mt-1 font-display text-xl font-semibold tracking-tight">{entry.title}</h3>
      {SECTIONS.map((s) => entry[s.key].length > 0 && (
        <section key={s.key} className="mt-5">
          <h4 className={cn('flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em]', s.cls)}><s.icon className="size-3.5" /> {s.label}</h4>
          <ul className="mt-2 grid gap-1.5">
            {entry[s.key].map((item, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </motion.article>
  );
}

export function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [version, setVersion] = useState(CHANGELOG[0]?.version);
  useEffect(() => { if (open) { markVersionSeen(); setVersion(CHANGELOG[0]?.version); } }, [open]);
  const entry = CHANGELOG.find((e) => e.version === version) ?? CHANGELOG[0];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88dvh] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">What's new <Badge variant="outline">v{CURRENT_VERSION}</Badge></DialogTitle>
          <DialogDescription>Every release of Control Point, newest first.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 sm:grid-cols-[180px_1fr]">
          <nav aria-label="Releases" className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:max-h-[64dvh] sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r">
            {CHANGELOG.map((e, i) => (
              <button
                key={e.version}
                type="button"
                onClick={() => setVersion(e.version)}
                aria-current={e.version === entry?.version ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors',
                  e.version === entry?.version ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                v{e.version}
                {i === 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">Latest</span>}
              </button>
            ))}
          </nav>
          <div className="max-h-[56dvh] overflow-y-auto px-6 py-5 sm:max-h-[64dvh]">
            {entry && <Release entry={entry} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
