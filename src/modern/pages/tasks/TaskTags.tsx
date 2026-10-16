// Task tags: robot subsystems, FTC award evidence and free-form labels.
// Read-only chips for cards and the task sheet, and toggle chips / a label
// input for the editor. Award chips explain what judges look for on hover.
import { useState } from 'react';
import { Award, Cog, Tag, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Input } from '../../../components/ui-kit';
import { FTC_AWARDS, MAX_LABEL_LENGTH, MAX_LABELS, awardById, cleanLabels, parseTagList } from '../../../types/taskTags';

const chip = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4';

/** Subsystem, award and label chips for a task (nothing when it has none). */
export function TaskTagChips({ task, className }: { task: any; className?: string }) {
  const subsystems = parseTagList(task?.subsystems);
  const awards = parseTagList(task?.awards).map(awardById).filter(Boolean) as { id: string; name: string; criteria: string }[];
  const labels = parseTagList(task?.labels);
  if (!subsystems.length && !awards.length && !labels.length) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {subsystems.map((s) => (
        <span key={`s-${s}`} className={cn(chip, 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300')}>
          <Cog className="size-3" aria-hidden />{s}<span className="sr-only"> subsystem</span>
        </span>
      ))}
      {awards.map((a) => (
        <span key={`a-${a.id}`} title={`${a.name}: ${a.criteria}`} className={cn(chip, 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
          <Award className="size-3" aria-hidden />{a.name}<span className="sr-only"> award evidence</span>
        </span>
      ))}
      {labels.map((l) => (
        <span key={`l-${l}`} className={cn(chip, 'border-border bg-muted/50 text-muted-foreground')}>
          <Tag className="size-3" aria-hidden />{l}
        </span>
      ))}
    </span>
  );
}

/** A row of toggle chips (multi-select). */
export function ToggleChips({ options, selected, onChange, label, id }: {
  options: { value: string; label: string; title?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  id?: string;
}) {
  return (
    <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors max-sm:py-1.5',
              on ? 'border-accent bg-accent/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const AWARD_OPTIONS = FTC_AWARDS.map((a) => ({ value: a.id, label: a.name, title: a.criteria }));

/** Labels: type and press Enter (or comma) to add; × to remove. */
export function LabelsInput({ value, onChange, id }: { value: string[]; onChange: (next: string[]) => void; id?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = cleanLabels([...value, ...draft.split(',')]);
    onChange(next);
    setDraft('');
  };
  const full = value.length >= MAX_LABELS;
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
          {value.map((l) => (
            <li key={l} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
              {l}
              <button type="button" aria-label={`Remove label ${l}`} onClick={() => onChange(value.filter((x) => x !== l))}
                className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        maxLength={MAX_LABEL_LENGTH * 3}
        disabled={full}
        placeholder={full ? `Up to ${MAX_LABELS} labels` : 'Add a label and press Enter'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && draft.trim()) { e.preventDefault(); add(); }
        }}
        onBlur={() => { if (draft.trim()) add(); }}
      />
    </div>
  );
}
