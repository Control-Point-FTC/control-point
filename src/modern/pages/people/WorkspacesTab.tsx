// People → Workspaces: every team you belong to, its join code (copyable),
// member count and accent; switch, edit, delete (admins) or leave. The
// workspace editor dialog is drafted.
import { Check, LogOut, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { notify } from '../../../components/dialog';
import type { useMembersController } from '../../../components/people/useMembersController';
import { Stagger, StaggerItem } from '../../ui/motion';
import { AccessCode } from './AccessCode';

type Ctl = ReturnType<typeof useMembersController>;

export function WorkspacesTab({ ctl, teams, members, onSwitchTeam, onDeleteTeam, onLeaveTeam, onNewWorkspace }: {
  ctl: Ctl; teams: any[]; members: any[];
  /** Anyone can start a workspace (FTC number first). */
  onNewWorkspace?: () => void;
  onSwitchTeam: (id: number) => any; onDeleteTeam: (team: any) => any; onLeaveTeam: (team: any) => any;
}) {
  return (
    <>
      <Stagger className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => {
          const active = team.id === ctl.activeTeamId;
          const roster = active ? members.filter((m) => m.team_id === team.id) : [];
          return (
            <StaggerItem key={team.id}>
              <motion.div whileHover={{ y: -2 }} className={cn('flex h-full flex-col rounded-xl border bg-card p-5', active ? 'border-accent/50' : 'border-border')}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-background" style={{ backgroundColor: team.accent_color || 'var(--color-accent)' }}>
                    {String(team.name || '?').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{team.name}</span>
                      {active && <Badge variant="soft">Active</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{team.number ? `#${team.number} · ` : ''}{team.member_count ?? roster.length} members</p>
                  </div>
                </div>
                {team.can_manage && (
                  <div className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3">
                    <span className="text-[11px] text-muted-foreground">Join code</span>
                    <AccessCode teamId={team.id} compact />
                  </div>
                )}
                <p className="mt-3 line-clamp-2 flex-1 text-xs text-muted-foreground">
                  {active ? (roster.length ? roster.map((m) => m.name).join(', ') : 'No members yet') : 'Switch to this workspace to manage its members.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  {!active && <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => onSwitchTeam(team.id)}><Repeat /> Switch</Button>}
                  {active && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="size-3.5 text-success" /> You’re here</span>}
                  {ctl.isAdmin ? (
                    <>
                      <Button variant="ghost" size="sm" className="ml-auto max-sm:h-11" onClick={() => ctl.openEditTeam(team)}><Pencil /> Edit</Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive max-sm:size-11" aria-label={`Delete ${team.name}`} onClick={() => onDeleteTeam(team)}><Trash2 /></Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="ml-auto text-warning hover:text-warning max-sm:h-11" onClick={() => onLeaveTeam(team)}><LogOut /> Leave</Button>
                  )}
                </div>
              </motion.div>
            </StaggerItem>
          );
        })}
        {onNewWorkspace && (
          <StaggerItem>
            <button type="button" onClick={onNewWorkspace} className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground">
              <Plus className="size-5" /> New workspace
            </button>
          </StaggerItem>
        )}
      </Stagger>
      <TeamEditorDialog ctl={ctl} />
    </>
  );
}

function TeamEditorDialog({ ctl }: { ctl: Ctl }) {
  const f = ctl.newTeam;
  const set = (patch: Partial<typeof f>) => ctl.setNewTeam({ ...f, ...patch });
  const editing = !!ctl.editingTeam;
  return (
    <Dialog open={ctl.showAddTeam} onOpenChange={(o) => { if (!o) ctl.closeTeamEditor(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit workspace' : 'New workspace'}</DialogTitle>
          <DialogDescription>{editing ? 'Name, number and accent apply for everyone.' : 'You’ll switch to it once it’s created.'}</DialogDescription>
        </DialogHeader>
        <form id="team-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); void ctl.handleAddTeam(); }}>
          <div className="grid gap-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input id="team-name" required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. CyberKnights" />
          </div>
          {editing && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="team-number">Team number</Label>
                <Input id="team-number" inputMode="numeric" value={f.number} onChange={(e) => set({ number: e.target.value })} placeholder="e.g. 12345" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="team-accent">Accent colour</Label>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Pick accent colour" className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5" value={f.accent_color || '#FFC700'} onChange={(e) => set({ accent_color: e.target.value })} />
                  <Input id="team-accent" value={f.accent_color} onChange={(e) => set({ accent_color: e.target.value })} placeholder="#FFC700" className="font-mono" />
                </div>
              </div>
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={ctl.closeTeamEditor}>Cancel</Button>
          <Button type="submit" form="team-form" disabled={ctl.savingTeam || !f.name.trim()}>{editing ? 'Save changes' : 'Create workspace'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
