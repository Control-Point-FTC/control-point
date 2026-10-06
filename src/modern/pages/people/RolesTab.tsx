// People → Roles: role cards (colour, holders, permissions), the drafted role
// editor sheet, and the per-member role picker. Editing needs manage_roles;
// everyone else sees the roles read-only.
import { Check, Lock, Pencil, ShieldCheck, Trash2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Dialog, DialogContent,
  DialogDescription, DialogHeader, DialogTitle, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader,
  SheetTitle, Skeleton, Switch,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { ROLE_COLOR_SWATCHES, type Role, type RoleRef, type useRolesController } from '../../../components/people/useRolesController';
import { EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';

type Ctl = ReturnType<typeof useRolesController>;

/** Role colours are user-picked hex values, so they're applied inline. */
export function RoleChip({ role, className }: { role: RoleRef; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium', className)}
      style={{ color: role.color, borderColor: `${role.color}55`, backgroundColor: `${role.color}14` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: role.color }} />
      {role.name}
    </span>
  );
}

export function RolesTab({ ctl, members, canManage }: { ctl: Ctl; members: any[]; canManage: boolean }) {
  if (ctl.loading && !ctl.roles.length) {
    return <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  }
  if (!ctl.roles.length) return <EmptyState icon={ShieldCheck} title="No roles yet" />;
  return (
    <>
      {!canManage && <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" /> You can view roles; ask an admin to change them.</p>}
      <Stagger className="grid gap-3 md:grid-cols-2">
        {ctl.roles.map((role) => {
          const holders = members.filter((m) => (m.roles || []).some((r: any) => r.id === role.id));
          const all = role.permissions.includes('*');
          return (
            <StaggerItem key={role.id}>
              <motion.div whileHover={{ y: -2 }} className="group relative h-full overflow-hidden rounded-xl border border-border bg-card p-5">
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: role.color }} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{role.name}</span>
                      {role.is_system ? <Badge variant="outline">System</Badge> : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" /> {role.member_count} {role.member_count === 1 ? 'member' : 'members'}</p>
                  </div>
                  {canManage && !role.is_system && (
                    <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <Button variant="ghost" size="icon-sm" className="max-sm:size-11" aria-label={`Edit ${role.name}`} onClick={() => ctl.openRole(role.id)}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive max-sm:size-11" aria-label={`Delete ${role.name}`} onClick={() => void ctl.deleteRole(role)}><Trash2 /></Button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {all ? <Badge variant="soft">All permissions</Badge>
                    : role.permissions.length ? role.permissions.map((p) => <Badge key={p} variant="outline" className="font-normal">{ctl.permLabel(p)}</Badge>)
                    : <span className="text-xs text-muted-foreground">No permissions</span>}
                </div>
                {holders.length > 0 && (
                  <p className="mt-3 truncate text-xs text-muted-foreground">{holders.slice(0, 4).map((m) => m.name).join(', ')}{holders.length > 4 ? ` +${holders.length - 4}` : ''}</p>
                )}
              </motion.div>
            </StaggerItem>
          );
        })}
      </Stagger>
      {canManage && <RoleEditorSheet ctl={ctl} />}
      {canManage && <MemberRolesDialog ctl={ctl} />}
    </>
  );
}

function RoleEditorSheet({ ctl }: { ctl: Ctl }) {
  const narrow = useIsNarrow();
  const f = ctl.form;
  const isNew = ctl.editingId === 'new';
  const current = !isNew && ctl.editingId != null ? ctl.roles.find((r) => r.id === ctl.editingId) : null;
  return (
    <Sheet open={ctl.editingId != null} onOpenChange={(o) => { if (!o) ctl.closeRole(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{isNew ? 'New role' : `Edit ${current?.name || 'role'}`}</SheetTitle>
          <SheetDescription>Group permissions, then hand the role to members.</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); void ctl.saveRole(); }}>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="role-name">Name</Label>
              <div className="flex items-center gap-2">
                <span className="size-9 shrink-0 rounded-lg border border-border" style={{ backgroundColor: f.color }} />
                <Input id="role-name" required maxLength={40} value={f.name} onChange={(e) => ctl.setForm({ ...f, name: e.target.value })} placeholder="e.g. Build Lead" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label id="role-color-label">Colour</Label>
              <div role="radiogroup" aria-labelledby="role-color-label" className="flex flex-wrap gap-2">
                {ROLE_COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={f.color === c}
                    aria-label={`Colour ${c}`}
                    onClick={() => ctl.setForm({ ...f, color: c })}
                    className={cn('flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:size-11', f.color === c && 'ring-2 ring-foreground')}
                    style={{ backgroundColor: c }}
                  >
                    {f.color === c && <Check className="size-4 text-white mix-blend-difference" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Permissions</Label>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {ctl.permKeys.map((p) => (
                  <li key={p.key}>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                      {p.label}
                      <Switch checked={f.permissions.includes(p.key)} onCheckedChange={() => ctl.togglePerm(p.key)} aria-label={p.label} />
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Granting <span className="font-medium text-foreground">Manage members</span> makes holders full admins.</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={ctl.closeRole}>Cancel</Button>
            <Button type="submit" disabled={ctl.saving || !f.name.trim()}>{ctl.saving ? 'Saving…' : isNew ? 'Create role' : 'Save role'}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MemberRolesDialog({ ctl }: { ctl: Ctl }) {
  const m = ctl.managingMember;
  return (
    <Dialog open={!!m} onOpenChange={(o) => { if (!o) ctl.setManagingMember(null); }}>
      <DialogContent className="gap-3 p-0 sm:max-w-sm">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Roles for {m?.name}</DialogTitle>
          <DialogDescription>Changes apply immediately.</DialogDescription>
        </DialogHeader>
        <Command className="border-t border-border">
          <CommandInput placeholder="Find a role…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No roles found.</CommandEmpty>
            <CommandGroup>
              {ctl.roles.map((role: Role) => {
                const on = ctl.memberRoles.includes(role.id);
                return (
                  <CommandItem key={role.id} value={role.name} onSelect={() => void ctl.toggleMemberRole(role)} disabled={ctl.toggling} className="min-h-11">
                    <span className="size-3 rounded-full" style={{ backgroundColor: role.color }} />
                    <span className="flex-1">{role.name}</span>
                    {role.is_system ? <span className="text-xs text-muted-foreground">System</span> : null}
                    <Check className={cn('size-4 text-accent', on ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
