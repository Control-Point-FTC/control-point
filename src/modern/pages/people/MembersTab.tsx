// People → Members: searchable directory with presence, role chips and a
// per-row action menu; a member sheet for details; the drafted member editor
// sheet; and the remove confirmation.
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Copy, KeyRound, Mail, MoreHorizontal, Pencil, Phone, Search, ShieldCheck, UserMinus, Users, Video,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, Switch, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { PRESENCE_META } from '../../../components/presence';
import { notify } from '../../../components/dialog';
import { type useMembersController } from '../../../components/people/useMembersController';
import { MemberAvatar } from '../tasks/AssigneePicker';
import { EmptyState } from '../../ui/page';
import { RoleChip } from './RolesTab';

type Ctl = ReturnType<typeof useMembersController>;

const PRESENCE_DOT: Record<string, string> = {
  online: 'bg-success', idle: 'bg-warning', dnd: 'bg-destructive', offline: 'bg-muted-foreground/50',
};

export function PresenceAvatar({ member, className }: { member: any; className?: string }) {
  const p = member?.presence || 'offline';
  return (
    <span className="relative inline-flex shrink-0">
      <MemberAvatar member={member} className={cn('size-9 border-0', className)} />
      <span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card', PRESENCE_DOT[p] || PRESENCE_DOT.offline)} title={PRESENCE_META[p]?.label || 'Offline'} />
    </span>
  );
}

type Filter = 'all' | 'online' | 'board';

export function MembersTab({ ctl, members, teams, currentUser, canManageRoles, onManageRoles, onCall, canInvite, onInvite }: {
  ctl: Ctl;
  canInvite?: boolean;
  onInvite?: () => void;
  members: any[];
  teams: any[];
  currentUser: any;
  canManageRoles: boolean;
  onManageRoles: (m: any) => void;
  onCall: (memberId: number, media: 'audio' | 'video') => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [viewId, setViewId] = useState<number | null>(null);
  const narrow = useIsNarrow();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank: Record<string, number> = { online: 0, idle: 1, dnd: 2 };
    return members
      .filter((m) => !q || `${m.name} ${m.email || ''} ${m.role || ''} ${(m.roles || []).map((r: any) => r.name).join(' ')}`.toLowerCase().includes(q))
      .filter((m) => filter === 'all' || (filter === 'online' ? m.presence && m.presence !== 'offline' : !!m.is_board))
      .sort((a, b) => (rank[a.presence] ?? 3) - (rank[b.presence] ?? 3) || String(a.name).localeCompare(String(b.name)));
  }, [members, query, filter]);

  const viewing = viewId == null ? null : members.find((m) => m.id === viewId) || null;

  const copyId = async (m: any) => {
    try { await navigator.clipboard.writeText(String(m.id)); notify('Member ID copied', 'success'); }
    catch { notify('Could not copy — try again.', 'error'); }
  };

  const actions = (m: any) => {
    const self = m.id === currentUser?.id;
    return (
      <>
        {!self && <DropdownMenuItem onSelect={() => onCall(m.id, 'audio')}><Phone /> Voice call</DropdownMenuItem>}
        {!self && <DropdownMenuItem onSelect={() => onCall(m.id, 'video')}><Video /> Video call</DropdownMenuItem>}
        {m.email && <DropdownMenuItem asChild><a href={`mailto:${m.email}`}><Mail /> Email</a></DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => void copyId(m)}><Copy /> Copy member ID</DropdownMenuItem>
        {(canManageRoles || ctl.isAdmin) && <DropdownMenuSeparator />}
        {canManageRoles && <DropdownMenuItem onSelect={() => onManageRoles(m)}><ShieldCheck /> Manage roles</DropdownMenuItem>}
        {ctl.isAdmin && <DropdownMenuItem onSelect={() => ctl.openEditMember(m)}><Pencil /> Edit member</DropdownMenuItem>}
        {ctl.isAdmin && m.email && <DropdownMenuItem onSelect={() => void ctl.handleResetPassword(m.email)}><KeyRound /> Reset password</DropdownMenuItem>}
        {ctl.isAdmin && !self && <DropdownMenuItem variant="destructive" onSelect={() => ctl.askRemoveMember(m)}><UserMinus /> Remove from team</DropdownMenuItem>}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people or roles" aria-label="Search members" className="pl-9 max-sm:h-11" />
        </div>
        <ToggleGroup type="single" value={filter} onValueChange={(v) => { if (v) setFilter(v as Filter); }} aria-label="Filter members">
          <ToggleGroupItem value="all" className="px-3 max-sm:h-10">All</ToggleGroupItem>
          <ToggleGroupItem value="online" className="px-3 max-sm:h-10">Online</ToggleGroupItem>
          <ToggleGroupItem value="board" className="px-3 max-sm:h-10">Board</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users} title={members.length ? 'No one matches' : 'No members yet'}
          description={members.length ? 'Try a different search or filter.' : canInvite ? 'Send your team an invite link so they can join.' : 'Ask an admin for an invite link to bring people in.'}
          action={!members.length && canInvite && onInvite ? <Button onClick={onInvite}>Invite people</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          <AnimatePresence initial={false}>
            {visible.map((m) => (
              <motion.li key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 pr-2">
                <button type="button" onClick={() => setViewId(m.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                  <PresenceAvatar member={m} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      {m.id === currentUser?.id && <Badge variant="outline">You</Badge>}
                      {m.is_board ? <Badge variant="soft">Board</Badge> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{[m.role, m.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="hidden flex-wrap justify-end gap-1 md:flex">
                    {(m.roles || []).slice(0, 3).map((r: any) => <RoleChip key={r.id} role={r} />)}
                    {(m.roles || []).length > 3 && <Badge variant="outline">+{m.roles.length - 3}</Badge>}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name}`} className="shrink-0 max-sm:size-11"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">{actions(m)}</DropdownMenuContent>
                </DropdownMenu>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Member details */}
      <Sheet open={!!viewing} onOpenChange={(o) => { if (!o) setViewId(null); }}>
        <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
          {viewing && (
            <>
              <SheetHeader className="items-center border-b border-border px-6 py-6 text-center">
                <PresenceAvatar member={viewing} className="size-16" />
                <SheetTitle className="mt-2 text-xl">{viewing.name}</SheetTitle>
                <SheetDescription>{PRESENCE_META[viewing.presence]?.label || 'Offline'}{viewing.role ? ` · ${viewing.role}` : ''}</SheetDescription>
                {viewing.id !== currentUser?.id && (
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => onCall(viewing.id, 'audio')}><Phone /> Call</Button>
                    <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => onCall(viewing.id, 'video')}><Video /> Video</Button>
                  </div>
                )}
              </SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label>Roles</Label>
                    {canManageRoles && <Button variant="ghost" size="sm" onClick={() => onManageRoles(viewing)}><ShieldCheck /> Manage</Button>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(viewing.roles || []).length ? viewing.roles.map((r: any) => <RoleChip key={r.id} role={r} />) : <span className="text-sm text-muted-foreground">No roles</span>}
                  </div>
                </div>
                <Separator />
                <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Email</dt><dd className="truncate">{viewing.email || '—'}</dd>
                  <dt className="text-muted-foreground">Team</dt><dd>{viewing.team_name || teams.find((t) => t.id === viewing.team_id)?.name || '—'}</dd>
                  <dt className="text-muted-foreground">Board</dt><dd>{viewing.is_board ? 'Yes' : 'No'}</dd>
                  <dt className="text-muted-foreground">Admin</dt><dd>{viewing.account_type === 'admin' ? 'Yes' : 'No'}</dd>
                </dl>
              </div>
              {ctl.isAdmin && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <Button variant="outline" onClick={() => { setViewId(null); ctl.openEditMember(viewing); }}><Pencil /> Edit</Button>
                  {viewing.email && <Button variant="ghost" onClick={() => void ctl.handleResetPassword(viewing.email)}><KeyRound /> Reset password</Button>}
                  {viewing.id !== currentUser?.id && (
                    <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => { setViewId(null); ctl.askRemoveMember(viewing); }}><UserMinus /> Remove</Button>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <MemberEditorSheet ctl={ctl} teams={teams} />
      <RemoveMemberDialog ctl={ctl} teams={teams} />
    </div>
  );
}

function MemberEditorSheet({ ctl, teams }: { ctl: Ctl; teams: any[] }) {
  const narrow = useIsNarrow();
  const f = ctl.newMember;
  const set = (patch: Partial<typeof f>) => ctl.setNewMember({ ...f, ...patch });
  const editing = !!ctl.editingMember;
  return (
    <Sheet open={ctl.showAddMember} onOpenChange={(o) => { if (!o) ctl.closeMemberEditor(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{editing ? 'Edit member' : 'Add member'}</SheetTitle>
          <SheetDescription>{editing ? 'Changes apply right away.' : 'They’ll be able to sign in with this email.'}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void ctl.handleAddMember(); }}>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="member-name">Full name</Label>
              <Input id="member-name" required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ada Lovelace" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="ada@example.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-role">Title</Label>
              <Input id="member-role" value={f.role} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. Lead Programmer" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-team">Team</Label>
              <Select value={f.team_id ? String(f.team_id) : 'active'} onValueChange={(v) => set({ team_id: v === 'active' ? '' : v })}>
                <SelectTrigger id="member-team"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Current team</SelectItem>
                  {teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` #${t.number}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Admin</span>
                <span className="block text-xs text-muted-foreground">Full access to the workspace. Finer permissions come from roles.</span>
              </span>
              <Switch checked={f.is_admin} onCheckedChange={(v) => set({ is_admin: v })} aria-label="Admin" />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-medium">Board member</span>
                <span className="block text-xs text-muted-foreground">Shows a Board badge. Doesn’t change what they can do.</span>
              </span>
              <Switch checked={f.is_board} onCheckedChange={(v) => set({ is_board: v })} aria-label="Board member" />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={ctl.closeMemberEditor}>Cancel</Button>
            <Button type="submit" disabled={ctl.savingMember || !f.name.trim()}>{editing ? 'Save changes' : 'Add member'}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function RemoveMemberDialog({ ctl, teams }: { ctl: Ctl; teams: any[] }) {
  const m = ctl.memberToRemove;
  return (
    <Dialog open={!!m} onOpenChange={(o) => { if (!o) ctl.setMemberToRemove(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {m?.name}?</DialogTitle>
          <DialogDescription>
            They’ll lose access immediately. Their messages, tasks, attendance history and other work are kept.
          </DialogDescription>
        </DialogHeader>
        {m && (
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <MemberAvatar member={m} className="size-9 border-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate text-xs text-muted-foreground">{[m.email, teams.find((t) => t.id === m.team_id)?.name].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        )}
        {ctl.removeError && <p className="text-sm text-destructive" role="alert">{ctl.removeError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => ctl.setMemberToRemove(null)}>Cancel</Button>
          <Button variant="destructive" onClick={() => void ctl.handleDeleteMember()} disabled={ctl.removingMember}>
            {ctl.removingMember ? 'Removing…' : 'Remove from team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
