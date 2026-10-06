// Modern People (phase 5a): one page for Members (/teams), Roles (/roles) and
// Workspaces (/teams?tab=workspaces), rebuilt on the shadcn kit over the
// shared useMembersController / useRolesController (same endpoints and
// permissions as Legacy TeamsView + RolesView).
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, Plus, ShieldCheck, Users } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger } from '../../../components/ui-kit';
import { useMembersController } from '../../../components/people/useMembersController';
import { useRolesController } from '../../../components/people/useRolesController';
import { useVoice } from '../../../voice/VoiceContext';
import { Page, PageHeader } from '../../ui/page';
import { MembersTab } from './MembersTab';
import { MemberRolesDialog, RolesTab } from './RolesTab';
import { WorkspacesTab } from './WorkspacesTab';

type Tab = 'members' | 'roles' | 'workspaces';

export function PeoplePage(props: any) {
  const { members = [], teams = [], currentUser, hasScope, hasPerm, refresh, onRefresh, onAddTeam, onSwitchTeam, onDeleteTeam, onLeaveTeam, activeTeamName } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const tab: Tab = location.pathname.startsWith('/roles') ? 'roles'
    : new URLSearchParams(location.search).get('tab') === 'workspaces' ? 'workspaces' : 'members';
  const go = (t: string) => navigate(t === 'roles' ? '/roles' : t === 'workspaces' ? '/teams?tab=workspaces' : '/teams');

  const ctl = useMembersController({ members, refresh, onRefresh, currentUser, hasScope, onAddTeam });
  const roles = useRolesController({ onRefresh, teamId: currentUser?.team_id });
  const canManageRoles = hasPerm ? hasPerm('manage_roles') : ctl.isAdmin;
  const voice = useVoice();

  const online = members.filter((m: any) => m.presence && m.presence !== 'offline').length;
  const action = tab === 'members' && ctl.isAdmin ? <Button onClick={ctl.openNewMember}><Plus /> Add member</Button>
    : tab === 'roles' && canManageRoles ? <Button onClick={() => roles.openRole('new')}><Plus /> New role</Button>
    : tab === 'workspaces' && ctl.isAdmin ? <Button onClick={ctl.openNewTeam}><Plus /> New workspace</Button>
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
            <TabsTrigger value="roles" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><ShieldCheck /> Roles</TabsTrigger>
            <TabsTrigger value="workspaces" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><Building2 /> Workspaces</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'members' && (
          <MembersTab
            ctl={ctl} members={members} teams={teams} currentUser={currentUser}
            canManageRoles={canManageRoles} onManageRoles={roles.openMemberRoles}
            onCall={(id, media) => voice.startCall([id], media)}
          />
        )}
        {tab === 'roles' && <RolesTab ctl={roles} members={members} canManage={canManageRoles} />}
        {tab === 'workspaces' && (
          <WorkspacesTab ctl={ctl} teams={teams} members={members} onSwitchTeam={onSwitchTeam} onDeleteTeam={onDeleteTeam} onLeaveTeam={onLeaveTeam} />
        )}
      </motion.div>
      {/* Role picker for "Manage roles" from the Members tab. */}
      {tab !== 'roles' && canManageRoles && <MemberRolesDialog ctl={roles} />}
    </Page>
  );
}

