// Task links: what blocks a task, what it blocks, and related tasks. A task
// is blocked while any task blocking it is still open (computed from the
// list, so finishing the blocker frees it at once). Managers add and remove
// links; anyone can open a linked task.
import { useState } from 'react';
import { Ban, Link2, Lock, Plus, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui-kit';
import { isOpenStatus } from '../../../types/taskStatus';
import type { LinkKind } from '../../../types/taskLinks';

const KIND_LABEL: Record<LinkKind, string> = { blocked_by: 'Blocked by', blocks: 'Blocks', related: 'Related' };
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => n > 0) : []);

/** Still-open tasks that block `task` (from the loaded list). */
export function openBlockers(task: any, byId: Map<number, any>): any[] {
  return ids(task?.blocked_by).map((id) => byId.get(id)).filter((t) => t && isOpenStatus(t.status));
}

/** Card markers: "Blocked" while a blocker is open, and how many links it has. */
export function TaskLinkMarks({ task, byId }: { task: any; byId: Map<number, any> }) {
  const blockers = openBlockers(task, byId);
  const count = ids(task?.blocked_by).length + ids(task?.blocks).length + ids(task?.related).length;
  if (!blockers.length && !count) return null;
  return (
    <>
      {blockers.length > 0 && isOpenStatus(task.status) && (
        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300" title={`Blocked by ${blockers.map((b) => b.title).join(', ')}`}>
          <Lock className="size-3" /> Blocked
        </Badge>
      )}
      {count > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={`${count} linked task${count === 1 ? '' : 's'}`}>
          <Link2 className="size-3" aria-hidden /> {count}<span className="sr-only"> linked</span>
        </span>
      )}
    </>
  );
}

/** The sheet's Links section: lists by kind, open-on-click, add/remove for managers. */
export function TaskLinksSection({ task, tasks, canEdit, onOpenTask, onAdd, onRemove }: {
  task: any;
  tasks: any[];
  canEdit: boolean;
  onOpenTask?: (id: number) => void;
  onAdd: (kind: LinkKind, otherId: number) => Promise<boolean>;
  onRemove: (kind: LinkKind, otherId: number) => Promise<boolean>;
}) {
  const byId = new Map(tasks.map((t) => [Number(t.id), t]));
  const [kind, setKind] = useState<LinkKind>('blocked_by');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lists: [LinkKind, number[]][] = [['blocked_by', ids(task.blocked_by)], ['blocks', ids(task.blocks)], ['related', ids(task.related)]];
  const linked = new Set(lists.flatMap(([, l]) => l));
  const candidates = tasks.filter((t) => t.id !== task.id && !linked.has(Number(t.id)) && t.status !== 'cancelled');
  const blockers = openBlockers(task, byId);
  const any = lists.some(([, l]) => l.length);
  if (!any && !canEdit) return null;
  const run = async (fn: () => Promise<boolean>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <section aria-label="Linked tasks" className="space-y-3">
      <Label className="block">Links</Label>
      {blockers.length > 0 && isOpenStatus(task.status) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          Blocked by {blockers.length === 1 ? 'an unfinished task' : `${blockers.length} unfinished tasks`}. It's free to start once {blockers.length === 1 ? 'that is' : 'they are'} done.
        </p>
      )}
      {lists.map(([k, list]) => list.length > 0 && (
        <div key={k}>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{KIND_LABEL[k]}</p>
          <ul className="space-y-1">
            {list.map((id) => {
              const t = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                  {t && !isOpenStatus(t.status) ? <Ban className="size-3.5 text-muted-foreground" aria-hidden /> : null}
                  <button
                    type="button"
                    className={cn('min-w-0 flex-1 truncate text-left hover:underline', t && !isOpenStatus(t.status) && 'text-muted-foreground line-through')}
                    onClick={() => onOpenTask?.(id)}
                    disabled={!onOpenTask || !t}
                  >
                    {t ? t.title : `Task #${id}`}
                  </button>
                  {canEdit && (
                    <button type="button" aria-label={`Remove link to ${t?.title ?? `task #${id}`}`} disabled={busy}
                      onClick={() => void run(() => onRemove(k, id))}
                      className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as LinkKind)}>
            <SelectTrigger className="w-36 max-sm:h-11" aria-label="Link type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as LinkKind[]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={busy || !candidates.length} className="max-sm:h-11"><Plus /> Link a task</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search tasks…" />
                <CommandList>
                  <CommandEmpty>No tasks found.</CommandEmpty>
                  <CommandGroup>
                    {candidates.map((t) => (
                      <CommandItem key={t.id} value={`${t.title} #${t.id}`} onSelect={() => { setOpen(false); void run(() => onAdd(kind, Number(t.id))); }}>
                        <span className="truncate">{t.title}</span>
                        <span className="ml-auto text-xs text-muted-foreground">#{t.id}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </section>
  );
}
