// Multi-select for task assignees: shadcn Popover + Command with avatars.
import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { assetUrl } from '../../../services/api';
import {
  Avatar, AvatarFallback, AvatarImage, Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger,
} from '../../../components/ui-kit';

export function MemberAvatar({ member, className }: { member: any; className?: string }) {
  const initials = String(member?.name || '?').split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Avatar className={cn('size-6 border-2 border-background', className)}>
      {member?.avatar_url && <AvatarImage src={assetUrl(member.avatar_url)} alt="" />}
      <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function AvatarStack({ members, max = 3 }: { members: any[]; max?: number }) {
  if (!members.length) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={members.map((m) => m.name).join(', ')}>
      {members.slice(0, max).map((m) => <MemberAvatar key={m.id} member={m} />)}
      {members.length > max && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-medium">+{members.length - max}</span>
      )}
    </span>
  );
}

export function AssigneePicker({ members, selected, onChange, id }: {
  members: any[];
  selected: number[];
  onChange: (ids: number[]) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = members.filter((m) => selected.includes(m.id));
  const toggle = (mid: number) => onChange(selected.includes(mid) ? selected.filter((x) => x !== mid) : [...selected, mid]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal">
          {chosen.length ? (
            <span className="flex flex-wrap gap-1">
              {chosen.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pl-0.5 pr-1.5 text-xs">
                  <MemberAvatar member={m} className="size-5 border-0" />
                  {m.name}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${m.name}`}
                    onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(m.id); } }}
                    className="rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </span>
                </span>
              ))}
            </span>
          ) : <span className="text-muted-foreground">Unassigned</span>}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {members.map((m) => {
                const on = selected.includes(m.id);
                return (
                  <CommandItem key={m.id} value={m.name} onSelect={() => toggle(m.id)}>
                    <MemberAvatar member={m} className="size-6 border-0" />
                    <span className="flex-1 truncate">{m.name}</span>
                    <Check className={cn('size-4', on ? 'opacity-100 text-accent' : 'opacity-0')} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
