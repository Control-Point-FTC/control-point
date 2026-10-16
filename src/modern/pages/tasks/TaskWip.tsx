// Work-in-progress limit on a board column: "3 / 4", amber at the limit and
// red over it. Admins set or clear it from the same control (team setting).
import { useState } from 'react';
import { Gauge } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger } from '../../../components/ui-kit';
import { MAX_WIP } from '../../../types/taskStatus';

export function WipLimit({ column, count, limit, canEdit, onSave }: {
  column: string;
  /** Open tasks in the column (whole team, not just a filter). */
  count: number;
  limit?: number;
  canEdit: boolean;
  onSave: (limit: number | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(limit ? String(limit) : '');
  const [open, setOpen] = useState(false);
  const over = !!limit && count > limit;
  const at = !!limit && count === limit;
  const badge = limit ? (
    <span
      className={cn('rounded-full px-1.5 text-xs tabular-nums', over ? 'bg-destructive/15 text-destructive' : at ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}
      title={over ? `Over the limit of ${limit}` : at ? `At the limit of ${limit}` : `Limit ${limit}`}
    >
      {count} / {limit}<span className="sr-only">{over ? ', over the limit' : at ? ', at the limit' : ''}</span>
    </span>
  ) : null;
  if (!canEdit) return badge;
  const n = Number(draft);
  const valid = draft === '' || (Number.isInteger(n) && n >= 1 && n <= MAX_WIP);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(limit ? String(limit) : ''); }}>
      <PopoverTrigger asChild>
        {badge ? <button type="button" aria-label={`${column} limit: ${count} of ${limit}. Change`} className="rounded-full">{badge}</button>
          : <Button variant="ghost" size="icon-sm" aria-label={`Set a limit for ${column}`} title="Set a work-in-progress limit"><Gauge /></Button>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`wip-${column}`}>Limit for {column}</Label>
          <Input id={`wip-${column}`} inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="No limit" />
          <p className="text-xs text-muted-foreground">The column is flagged when more tasks than this are in it. Empty means no limit.</p>
        </div>
        <div className="flex justify-end gap-2">
          {limit && <Button size="sm" variant="ghost" onClick={async () => { if (await onSave(null)) setOpen(false); }}>Remove</Button>}
          <Button size="sm" disabled={!valid} onClick={async () => { if (await onSave(draft === '' ? null : n)) setOpen(false); }}>Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
