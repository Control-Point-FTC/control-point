// Modern People (phase 5a): the member directory (/teams) and Workspaces
// (/teams?tab=workspaces), over the shared useMembersController. Roles moved
// to Settings → Roles (/roles redirects there); "Manage roles" on a member
// still opens the picker here.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, LogIn, Plus, Settings as SettingsIcon, UserPlus, Users } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger } from '../../../components/ui-kit';
import { useMembersController } from '../../../components/people/useMembersController';
import { useRolesController } from '../../../components/people/useRolesController';
import { useVoice } from '../../../voice/VoiceContext';
import { Page, PageHeader } from '../../ui/page';
import { MembersTab } from './MembersTab';
import { MemberRolesDialog } from './RolesTab';
import { WorkspacesTab } from './WorkspacesTab';
import { InviteDialog } from './InviteDialog';
import { JoinRequestsCard } from './JoinRequestsCard';
import { JoinWorkspaceDialog } from './JoinWorkspaceDialog';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

type Tab = 'members' | 'workspaces';

export function PeoplePage(props: any) {
  const { members = [], teams = [], currentUser, hasScope, hasPerm, refresh, onRefresh, onAddTeam, onSwitchTeam, onDeleteTeam, onLeaveTeam, onJoinTeam, activeTeamName } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const tab: Tab = new URLSearchParams(location.search).get('tab') === 'workspaces' ? 'workspaces' : 'members';
  const go = (t: string) => navigate(t === 'workspaces' ? '/teams?tab=workspaces' : '/teams');

  const ctl = useMembersController({ members, refresh, onRefresh, currentUser, hasScope });
  const roles = useRolesController({ onRefresh, teamId: currentUser?.team_id });
  const canManageRoles = hasPerm ? hasPerm('manage_roles') : ctl.isAdmin;
  // Join links replace "Add member": admins and anyone with "Invite people".
  const canInvite = ctl.isAdmin || !!hasPerm?.('invite_members');
  const voice = useVoice();
  const params = new URLSearchParams(location.search);
  // Dialogs the workspace switcher and Settings open in one hop with a URL
  // flag (?invite=1, ?new=1, ?join=1); the flag lives in the URL so it
  // survives the page settling, and closing the dialog clears it.
  const [openLocal, setOpenLocal] = useState<Record<string, boolean>>({});
  const flagDialog = (flag: string, allowed = true) => [
    !!openLocal[flag] || (params.get(flag) === '1' && allowed),
    (open: boolean) => {
      setOpenLocal((o) => ({ ...o, [flag]: open }));
      if (!open && params.has(flag)) {
        params.delete(flag);
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true });
      }
    },
  ] as const;
  const [inviteOpen, setInviteOpen] = flagDialog('invite', canInvite);
  const [joinOpen, setJoinOpen] = flagDialog('join', !!onJoinTeam);
  const [createOpen, setCreateOpen] = flagDialog('new', !!onAddTeam);

  const online = members.filter((m: any) => m.presence && m.presence !== 'offline').length;
  const action = tab === 'members' && (canInvite || canManageRoles) ? (
      <div className="flex gap-2">
        {canManageRoles && <Button variant="outline" onClick={() => navigate('/settings?section=roles')}><SettingsIcon /> Roles</Button>}
        {canInvite && <Button onClick={() => setInviteOpen(true)}><UserPlus /> Invite people</Button>}
      </div>
    )
    : tab === 'workspaces' ? (
      <div className="flex gap-2">
        {onJoinTeam && <Button variant="outline" onClick={() => setJoinOpen(true)}><LogIn /> Join</Button>}
        {onAddTeam && <Button onClick={() => setCreateOpen(true)}><Plus /> New workspace</Button>}
      </div>
    )
    : null;

  return (
    <Page>
      <PageHeader
        eyebrow={activeTeamName || 'Team'}
        title="People"
        description={`${members.length} ${members.length === 1 ? 'member' : 'members'} · ${online} online`}
        actions={action}
      >
        <Tabs value={tab} onValueChange={go}>
          <TabsList className="max-sm:w-full">
            <TabsTrigger value="members" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><Users /> Members</TabsTrigger>
            <TabsTrigger value="workspaces" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><Building2 /> Workspaces</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'members' && canInvite && <JoinRequestsCard onDecided={onRefresh} />}
        {tab === 'members' && (
          <MembersTab
            canInvite={canInvite} onInvite={() => setInviteOpen(true)}
            ctl={ctl} members={members} teams={teams} currentUser={currentUser}
            canManageRoles={canManageRoles} onManageRoles={roles.openMemberRoles}
            onCall={(id, media) => voice.startCall([id], media)}
          />
        )}
        {tab === 'workspaces' && (
          <WorkspacesTab ctl={ctl} teams={teams} members={members} onSwitchTeam={onSwitchTeam} onDeleteTeam={onDeleteTeam} onLeaveTeam={onLeaveTeam} onNewWorkspace={onAddTeam ? () => setCreateOpen(true) : undefined} />
        )}
      </motion.div>
      {/* Role picker for "Manage roles" from the Members tab. */}
      {canManageRoles && <MemberRolesDialog ctl={roles} />}
      {canInvite && <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} teamName={activeTeamName} />}
      {onJoinTeam && <JoinWorkspaceDialog open={joinOpen} onOpenChange={setJoinOpen} onJoin={onJoinTeam} />}
      {onAddTeam && <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} onAddTeam={onAddTeam} />}
    </Page>
  );
}

