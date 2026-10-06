// Shared Roles logic for the Legacy RolesView and the Modern People page.
// Extracted from RolesView: same endpoints (/api/roles, /api/role-permissions,
// /api/members/:id/roles). The role editor (open role + its form) is drafted.
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { getDraft, newSessionId, useDraft } from '../../modern/drafts';

export interface RoleRef { id: number; name: string; color: string }
export interface Role extends RoleRef {
  team_id: number;
  permissions: string[];
  position: number;
  is_system: number;
  member_count: number;
}
export interface RoleDraft { name: string; color: string; permissions: string[] }

export const ROLE_COLOR_SWATCHES = [
  '#FFC700', '#F97316', '#EF4444', '#EC4899',
  '#8B5CF6', '#3B82F6', '#22C55E', '#14B8A6', '#71717A',
];
export const NEW_ROLE: RoleDraft = { name: '', color: '#71717A', permissions: ['view_ai'] };

export function useRolesController({ onRefresh, teamId }: { onRefresh?: () => any; teamId?: number | null }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permKeys, setPermKeys] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useDraft<number | 'new' | null>('roles:editing-id', null);
  const [form, setForm] = useDraft<RoleDraft>('roles:form', NEW_ROLE);
  const [gen, setGen] = useDraft<number>('roles:editor-gen', 0);
  const [savingGen, setSavingGen] = useDraft<number>('roles:saving', 0);
  const saving = savingGen !== 0 && savingGen === gen;
  const [managingMember, setManagingMember] = useState<any>(null);
  const [memberRoles, setMemberRoles] = useState<number[]>([]);
  const [toggling, setToggling] = useState(false);

  // Latest-wins: a reply for an earlier request (e.g. the previous
  // workspace) never overwrites a newer one.
  const loadSeq = useRef(0);
  const load = async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([apiFetch('/api/roles'), apiFetch('/api/role-permissions')]);
      const rData = await rRes.json();
      const pData = await pRes.json();
      if (seq !== loadSeq.current) return;
      if (rRes.ok) setRoles(Array.isArray(rData) ? rData : []);
      if (pRes.ok) setPermKeys(Array.isArray(pData) ? pData : []);
    } catch {
      if (seq === loadSeq.current) notify('Could not load roles', 'error');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  // Reload when the active workspace changes (switching or creating one
  // doesn't remount the page).
  useEffect(() => {
    setRoles([]);
    setManagingMember(null);
    load();
  }, [teamId]);
  useEffect(() => {
    // Live role sync: another admin's role changes refresh this view too.
    const onRolesChanged = () => load();
    window.addEventListener('roles-changed', onRolesChanged);
    return () => window.removeEventListener('roles-changed', onRolesChanged);
  }, []);

  const openRole = (id: number | 'new') => {
    setGen(newSessionId());
    const r = id === 'new' ? null : roles.find((x) => x.id === id);
    setForm(r ? { name: r.name, color: r.color, permissions: r.permissions } : NEW_ROLE);
    setEditingId(id);
  };
  const closeRole = () => {
    setGen(newSessionId());
    setEditingId(null);
    setForm(NEW_ROLE);
  };
  const togglePerm = (key: string) => setForm((f) => ({
    ...f, permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key],
  }));

  const saveRole = async (draft: RoleDraft = { ...form, name: form.name.trim() }) => {
    if (!draft.name) {
      notify('Role name is required', 'error');
      return;
    }
    const session = getDraft<number>('roles:editor-gen', 0);
    if (getDraft<number>('roles:saving', 0) === session) return; // already saving this session
    const id = editingId;
    setSavingGen(session);
    try {
      const url = id === 'new' ? '/api/roles' : `/api/roles/${id}`;
      const res = await apiFetch(url, {
        method: id === 'new' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || 'Could not save role', 'error');
        return;
      }
      notify(id === 'new' ? 'Role created' : 'Role updated', 'success');
      if (getDraft<number>('roles:editor-gen', 0) === session) closeRole();
      await load();
      onRefresh?.();
    } catch {
      notify('Could not save role', 'error');
    } finally {
      if (getDraft<number>('roles:saving', 0) === session) setSavingGen(0);
    }
  };

  const deleteRole = async (role: Role) => {
    const ok = await confirmDialog({
      title: 'Delete role',
      message: `Delete the "${role.name}" role? Members who have it will lose those permissions.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return false;
    const res = await apiFetch(`/api/roles/${role.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error || 'Could not delete role', 'error');
      return false;
    }
    notify('Role deleted', 'success');
    await load();
    onRefresh?.();
    return true;
  };

  const openMemberRoles = (m: any) => {
    setManagingMember(m);
    setMemberRoles((m.roles || []).map((r: RoleRef) => r.id));
  };

  const toggleMemberRole = async (role: Role) => {
    if (!managingMember || toggling) return;
    const has = memberRoles.includes(role.id);
    // Optimistic: flip the chip instantly, roll back on failure.
    const prev = memberRoles;
    setMemberRoles((p) => (has ? p.filter((id) => id !== role.id) : [...p, role.id]));
    setToggling(true);
    try {
      const url = has ? `/api/members/${managingMember.id}/roles/${role.id}` : `/api/members/${managingMember.id}/roles`;
      const res = await apiFetch(url, {
        method: has ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: has ? undefined : JSON.stringify({ role_id: role.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMemberRoles(prev);
        notify(data.error || 'Could not update roles', 'error');
        return;
      }
      await load();
      onRefresh?.();
    } catch {
      setMemberRoles(prev);
      notify('Could not update roles', 'error');
    } finally {
      setToggling(false);
    }
  };

  const permLabel = (key: string) => permKeys.find((k) => k.key === key)?.label || key;

  return {
    roles, permKeys, permLabel, loading, load,
    editingId, form, setForm, openRole, closeRole, togglePerm, saving, saveRole, deleteRole,
    managingMember, setManagingMember, memberRoles, toggling, openMemberRoles, toggleMemberRole,
  };
}
