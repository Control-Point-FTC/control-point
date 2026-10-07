// Settings → Workspace → Members / Roles (owner: Discord-style Settings, with
// Members and Roles living in Workspace Settings). The same tabs as the People
// page, over the same controllers, endpoints and permissions.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui-kit';
import { useMembersController } from '../../../components/people/useMembersController';
import { useRolesController } from '../../../components/people/useRolesController';
import { useVoice } from '../../../voice/VoiceContext';
import { MembersTab } from '../people/MembersTab';
import { MemberRolesDialog, RolesTab } from '../people/RolesTab';
import { InviteDialog } from '../people/InviteDialog';
import { JoinRequestsCard } from '../people/JoinRequestsCard';

export function MembersSection(props: any) {
  const { members = [], teams = [], currentUser, hasScope, hasPerm, refresh, onRefresh, activeTeamName } = props;
  const ctl = useMembersController({ members, refresh, onRefresh, currentUser, hasScope });
  const roles = useRolesController({ onRefresh, teamId: currentUser?.team_id });
  const canManageRoles = hasPerm ? hasPerm('manage_roles') : ctl.isAdmin;
  const canInvite = ctl.isAdmin || !!hasPerm?.('invite_members');
  const voice = useVoice();
  // ?invite=1 (switcher, Workspace → Invites) opens the dialog straight
  // away; closing it clears the flag so it doesn't reopen later.
  const [params, setParams] = useSearchParams();
  const [inviteOpenLocal, setInviteOpenLocal] = useState(false);
  const inviteOpen = canInvite && (inviteOpenLocal || params.get('invite') === '1');
  const setInviteOpen = (open: boolean) => {
    setInviteOpenLocal(open);
    if (!open && params.has('invite')) {
      const next = new URLSearchParams(params);
      next.delete('invite');
      setParams(next, { replace: true });
    }
  };
  const online = members.filter((m: any) => m.presence && m.presence !== 'offline').length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{members.length} {members.length === 1 ? 'member' : 'members'} · {online} online</p>
        {canInvite && <Button onClick={() => setInviteOpen(true)} className="max-sm:h-11"><UserPlus /> Invite people</Button>}
      </div>
      {canInvite && <JoinRequestsCard onDecided={onRefresh} />}
      <MembersTab
        canInvite={canInvite} onInvite={() => setInviteOpen(true)}
        ctl={ctl} members={members} teams={teams} currentUser={currentUser}
        canManageRoles={canManageRoles} onManageRoles={roles.openMemberRoles}
        onCall={(id, media) => voice.startCall([id], media)}
      />
      {canManageRoles && <MemberRolesDialog ctl={roles} />}
      {canInvite && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} teamName={activeTeamName} />}
    </div>
  );
}

export function RolesSection(props: any) {
  const { members = [], currentUser, hasPerm, onRefresh } = props;
  const roles = useRolesController({ onRefresh, teamId: currentUser?.team_id });
  const canManage = !!hasPerm?.('manage_roles');
  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => roles.openRole('new')} className="max-sm:h-11"><Plus /> New role</Button>
        </div>
      )}
      <RolesTab ctl={roles} members={members} canManage={canManage} />
    </div>
  );
}
