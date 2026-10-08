// Shared Members/Workspaces logic for the Legacy TeamsView and the Modern
// People page. Extracted from TeamsView: same endpoints (/api/members,
// /api/teams/:id, /api/auth/reset). The member and team editors are drafted so
// a half-filled form survives a Legacy/Modern switch; each editor session has
// a generation so a late save never closes a newer session.
import { useState } from 'react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { getDraft, newSessionId, useDraft } from '../../modern/drafts';
import { bulkDelete, runBulk } from '../../modern/ui/selection';

// Permissions come from roles; `is_admin` maps to the system Admin role.
export interface MemberForm { team_id: string | number; name: string; role: string; email: string; is_board: boolean; is_admin: boolean }
export interface TeamForm { name: string; number: string; accent_color: string; primary_color: string; text_color: string }
export const EMPTY_MEMBER: MemberForm = { team_id: '', name: '', role: '', email: '', is_board: false, is_admin: false };
export const EMPTY_TEAM: TeamForm = { name: '', number: '', accent_color: '', primary_color: '', text_color: '' };

export function useMembersController({ members, refresh, onRefresh, currentUser, hasScope }: {
  members: any[];
  refresh: { members: () => any };
  onRefresh: () => any;
  currentUser: any;
  hasScope: (s: string) => boolean;
}) {
  const isAdmin = hasScope('admin');
  const activeTeamId = currentUser?.team_id;

  // ---- Member editor (drafted) ----
  const [showAddMember, setShowAddMember] = useDraft<boolean>('members:editor-open', false);
  const [editingMemberId, setEditingMemberId] = useDraft<number | null>('members:editing-id', null);
  const [newMember, setNewMember] = useDraft<MemberForm>('members:form', EMPTY_MEMBER);
  // Session id of the open editor, and of the session whose save is in flight.
  const [memberGen, setMemberGen] = useDraft<number>('members:editor-gen', 0);
  const [memberSavingGen, setMemberSavingGen] = useDraft<number>('members:editor-saving', 0);
  const savingMember = memberSavingGen !== 0 && memberSavingGen === memberGen;
  const editingMember = editingMemberId == null ? null : (members || []).find((m: any) => m.id === editingMemberId) || { id: editingMemberId };
  const bumpMemberGen = () => setMemberGen(newSessionId());

  const openNewMember = () => {
    bumpMemberGen();
    setEditingMemberId(null);
    setNewMember(EMPTY_MEMBER);
    setShowAddMember(true);
  };
  const openEditMember = (m: any) => {
    bumpMemberGen();
    setEditingMemberId(m.id);
    setNewMember({
      team_id: m.team_id || '',
      name: m.name,
      role: m.role,
      email: m.email,
      is_board: m.is_board === 1 || m.is_board === true,
      is_admin: m.account_type === 'admin',
    });
    setShowAddMember(true);
  };
  const closeMemberEditor = () => {
    bumpMemberGen();
    setShowAddMember(false);
    setEditingMemberId(null);
    setNewMember(EMPTY_MEMBER);
  };

  const handleAddMember = async () => {
    const gen = getDraft<number>('members:editor-gen', 0);
    if (getDraft<number>('members:editor-saving', 0) === gen) return; // this session is already saving
    const id = editingMemberId;
    const url = id ? `/api/members/${id}` : '/api/members';
    const form = newMember;
    setMemberSavingGen(gen);
    try {
      const { is_admin, ...rest } = form;
      const res = await apiFetch(url, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, account_type: is_admin ? 'admin' : 'student' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || 'Could not save member', 'error');
        return;
      }
      // Never a silent no-op: another role can still make them an admin.
      if (data.stillAdminVia) notify(`Saved — still an admin through the “${data.stillAdminVia}” role. Remove it in Manage roles.`, 'info');
      if (getDraft<number>('members:editor-gen', 0) === gen) closeMemberEditor();
      refresh.members();
    } catch {
      notify('Could not save member', 'error');
    } finally {
      if (getDraft<number>('members:editor-saving', 0) === gen) setMemberSavingGen(0);
    }
  };

  // ---- Remove member ----
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [removeError, setRemoveError] = useState('');
  const [removingMember, setRemovingMember] = useState(false);
  const askRemoveMember = (m: any) => { setMemberToRemove(m); setRemoveError(''); };
  const handleDeleteMember = async () => {
    if (!memberToRemove) return;
    setRemovingMember(true);
    setRemoveError('');
    try {
      const res = await apiFetch(`/api/members/${memberToRemove.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRemoveError(err.error || 'Could not remove member');
        return;
      }
      setMemberToRemove(null);
      refresh.members();
    } catch (error) {
      setRemoveError('Could not remove member: ' + error);
    } finally {
      setRemovingMember(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!(await confirmDialog({ title: 'Send password reset', message: `Email ${email} a code to choose a new password? Their current password keeps working until they change it.`, confirmLabel: 'Send code' }))) return;
    const res = await apiFetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { notify(data.error || "Couldn't send the reset email", 'error'); return; }
    notify(`Reset code sent to ${email}.`, 'success');
  };

  // ---- Team (workspace) editor (drafted) ----
  const [showAddTeam, setShowAddTeam] = useDraft<boolean>('teams:editor-open', false);
  const [editingTeam, setEditingTeam] = useDraft<any>('teams:editing', null);
  const [newTeam, setNewTeam] = useDraft<TeamForm>('teams:form', EMPTY_TEAM);
  const [teamGen, setTeamGen] = useDraft<number>('teams:editor-gen', 0);
  const [teamSavingGen, setTeamSavingGen] = useDraft<number>('teams:editor-saving', 0);
  const savingTeam = teamSavingGen !== 0 && teamSavingGen === teamGen;
  const bumpTeamGen = () => setTeamGen(newSessionId());

  const openEditTeam = (team: any) => {
    bumpTeamGen();
    setEditingTeam(team);
    setNewTeam({
      name: team.name, number: team.number,
      accent_color: team.accent_color || '', primary_color: team.primary_color || '', text_color: team.text_color || '',
    });
    setShowAddTeam(true);
  };
  const closeTeamEditor = () => {
    bumpTeamGen();
    setShowAddTeam(false);
    setEditingTeam(null);
    setNewTeam(EMPTY_TEAM);
  };

  const handleAddTeam = async () => {
    const gen = getDraft<number>('teams:editor-gen', 0);
    if (getDraft<number>('teams:editor-saving', 0) === gen) return;
    const done = () => { if (getDraft<number>('teams:editor-gen', 0) === gen) closeTeamEditor(); };
    setTeamSavingGen(gen);
    try {
      // New workspaces are created by CreateWorkspaceForm (FTC number first);
      // this editor only edits.
      if (editingTeam) {
        const { name, number, accent_color } = newTeam;
        const res = await apiFetch(`/api/teams/${editingTeam.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, number, accent_color }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save team');
        notify('Team updated', 'success');
        done();
        onRefresh();
      }
    } catch (e: any) {
      notify(e.message || 'Could not save team', 'error');
    } finally {
      if (getDraft<number>('teams:editor-saving', 0) === gen) setTeamSavingGen(0);
    }
  };

  // ---- Bulk actions on a selection (V3.5) ----
  const bulkRemoveMembers = async (ids: number[]) => {
    const ok = await bulkDelete(ids, async (id) => {
      const res = await apiFetch(`/api/members/${id}`, { method: 'DELETE' }).catch(() => null);
      return !!res?.ok;
    }, {
      noun: 'member',
      detail: `${ids.length === 1 ? 'This person loses' : `These ${ids.length} people lose`} access to the workspace. Their accounts and other workspaces stay; you can invite them back.`,
    });
    if (ok === false) return false;
    refresh.members();
    return true;
  };
  const bulkGiveRole = async (ids: number[], roleId: number) => {
    await runBulk(ids, async (id) => {
      const res = await apiFetch(`/api/members/${id}/roles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role_id: roleId }) }).catch(() => null);
      return !!res?.ok;
    }, { verb: 'Updated roles for', noun: 'member' });
    refresh.members();
  };

  return {
    bulkRemoveMembers, bulkGiveRole,
    isAdmin, activeTeamId,
    showAddMember, editingMember, newMember, setNewMember, savingMember, openNewMember, openEditMember, closeMemberEditor, handleAddMember,
    memberToRemove, setMemberToRemove, askRemoveMember, removeError, removingMember, handleDeleteMember, handleResetPassword,
    showAddTeam, editingTeam, newTeam, setNewTeam, savingTeam, openEditTeam, closeTeamEditor, handleAddTeam,
  };
}
