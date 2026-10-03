import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, X, ShieldCheck, Users } from 'lucide-react';
import { apiFetch } from '../services/api';
import { confirmDialog, notify } from './dialog';

export interface RoleRef {
  id: number;
  name: string;
  color: string;
}

interface Role extends RoleRef {
  team_id: number;
  permissions: string[];
  position: number;
  is_system: number;
  member_count: number;
}

const COLOR_SWATCHES = [
  '#FFC700', '#F97316', '#EF4444', '#EC4899',
  '#8B5CF6', '#3B82F6', '#22C55E', '#14B8A6', '#71717A',
];

export function RoleBadge({ role }: { role: RoleRef }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border"
      style={{
        color: role.color,
        borderColor: `${role.color}55`,
        backgroundColor: `${role.color}14`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: role.color }} />
      {role.name}
    </span>
  );
}

function RoleForm({
  initial,
  permKeys,
  onSave,
  onCancel,
  saving,
}: {
  initial: { name: string; color: string; permissions: string[] };
  permKeys: { key: string; label: string }[];
  onSave: (draft: { name: string; color: string; permissions: string[] }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [permissions, setPermissions] = useState<string[]>(initial.permissions);

  const togglePerm = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-text-muted uppercase tracking-wide">Role name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Build Lead"
          maxLength={40}
          className="mt-1.5 w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all"
        />
      </div>
      <div>
        <label className="text-xs font-bold text-text-muted uppercase tracking-wide">Color</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className={`w-8 h-8 rounded-lg border-2 transition-all ${color === c ? 'border-text-base scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-text-muted uppercase tracking-wide">Permissions</label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {permKeys.map((p) => (
            <label
              key={p.key}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                permissions.includes(p.key)
                  ? 'border-accent/50 bg-accent/10 text-text-base'
                  : 'border-text-base/10 bg-text-base/[0.02] text-text-muted hover:border-text-base/25'
              }`}
            >
              <input
                type="checkbox"
                checked={permissions.includes(p.key)}
                onChange={() => togglePerm(p.key)}
                className="accent-[#FFC700] w-4 h-4"
              />
              <span className="text-[13px] font-medium">{p.label}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-text-muted/70 mt-2">
          Tip: granting <span className="text-text-base font-semibold">Manage members</span> makes holders full admins.
        </p>
      </div>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-elevated text-text-base hover:bg-text-base/10 border border-text-base/10 font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ name: name.trim(), color, permissions })}
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
          style={{ backgroundColor: '#FFC700', color: '#231A00' }}
        >
          {saving ? 'Saving…' : 'Save role'}
        </button>
      </div>
    </div>
  );
}

export default function RolesView({ members, onRefresh }: any) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permKeys, setPermKeys] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [managingMember, setManagingMember] = useState<any>(null);
  const [memberRoles, setMemberRoles] = useState<number[]>([]);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([apiFetch('/api/roles'), apiFetch('/api/role-permissions')]);
      const rData = await rRes.json();
      const pData = await pRes.json();
      if (rRes.ok) setRoles(Array.isArray(rData) ? rData : []);
      if (pRes.ok) setPermKeys(Array.isArray(pData) ? pData : []);
    } catch {
      notify('Could not load roles', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Live role sync: another admin's role changes refresh this view too.
    const onRolesChanged = () => load();
    window.addEventListener('roles-changed', onRolesChanged);
    return () => window.removeEventListener('roles-changed', onRolesChanged);
  }, []);

  const saveRole = async (draft: { name: string; color: string; permissions: string[] }) => {
    if (!draft.name) {
      notify('Role name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const url = editingId === 'new' ? '/api/roles' : `/api/roles/${editingId}`;
      const res = await apiFetch(url, {
        method: editingId === 'new' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || 'Could not save role', 'error');
        return;
      }
      notify(editingId === 'new' ? 'Role created' : 'Role updated', 'success');
      setEditingId(null);
      await load();
      onRefresh?.();
    } catch {
      notify('Could not save role', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (role: Role) => {
    const ok = await confirmDialog({
      title: 'Delete role',
      message: `Delete the "${role.name}" role? Members who have it will lose those permissions.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/roles/${role.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error || 'Could not delete role', 'error');
      return;
    }
    notify('Role deleted', 'success');
    await load();
    onRefresh?.();
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
    setMemberRoles((prev) => (has ? prev.filter((id) => id !== role.id) : [...prev, role.id]));
    setToggling(true);
    try {
      const url = has
        ? `/api/members/${managingMember.id}/roles/${role.id}`
        : `/api/members/${managingMember.id}/roles`;
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
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-text-base/10 bg-text-base/[0.03] p-6 animate-pulse">
            <div className="h-5 w-40 bg-text-base/10 rounded" />
            <div className="h-3 w-64 bg-text-base/5 rounded mt-3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto min-w-0">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-bold text-text-base flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-accent" /> Roles
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Discord-style roles — group permissions and hand them to members. Give someone the Admin role (or any
            role with <span className="text-text-base font-semibold">Manage members</span>) to make them an admin.
          </p>
        </div>
        <button
          onClick={() => setEditingId('new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all active:scale-95 shrink-0"
          style={{ backgroundColor: '#FFC700', color: '#231A00' }}
        >
          <Plus className="w-4 h-4" /> New role
        </button>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-surface p-6 w-full max-w-lg shadow-[0_8px_30px_rgba(0,0,0,0.35)] max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-lg font-display font-bold text-text-base mb-4">
              {editingId === 'new' ? 'New role' : `Edit ${roles.find((r) => r.id === editingId)?.name || 'role'}`}
            </h3>
            <RoleForm
              initial={
                editingId === 'new'
                  ? { name: '', color: '#71717A', permissions: ['view_ai'] }
                  : (() => {
                      const r = roles.find((x) => x.id === editingId)!;
                      return { name: r.name, color: r.color, permissions: r.permissions };
                    })()
              }
              permKeys={permKeys}
              onSave={saveRole}
              onCancel={() => setEditingId(null)}
              saving={saving}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="rounded-2xl border border-text-base/10 bg-text-base/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                <span className="text-text-base font-bold truncate">{role.name}</span>
                {role.is_system ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted/70 border border-text-base/15 rounded-md px-1.5 py-0.5">
                    System
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="inline-flex items-center gap-1 text-[11px] text-text-muted mr-1">
                  <Users className="w-3.5 h-3.5" /> {role.member_count}
                </span>
                {!role.is_system && (
                  <>
                    <button
                      onClick={() => setEditingId(role.id)}
                      className="p-2 text-text-muted/70 hover:text-accent transition-colors"
                      title="Edit role"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteRole(role)}
                      className="p-2 text-text-muted/70 hover:text-rose-400 transition-colors"
                      title="Delete role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions.includes('*') ? (
                <span className="text-[11px] font-semibold text-accent bg-accent/10 border border-accent/30 rounded-md px-2 py-0.5">
                  All permissions
                </span>
              ) : role.permissions.length ? (
                role.permissions.map((p) => {
                  const label = permKeys.find((k) => k.key === p)?.label || p;
                  return (
                    <span
                      key={p}
                      className="text-[11px] font-medium text-text-base/70 bg-text-base/5 border border-text-base/10 rounded-md px-2 py-0.5"
                    >
                      {label}
                    </span>
                  );
                })
              ) : (
                <span className="text-[11px] text-text-muted/60">No permissions</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-lg font-display font-bold text-text-base mb-1">Members</h3>
        <p className="text-sm text-text-muted mb-4">Assign roles to members — changes apply immediately.</p>
        {/* Mobile: stacked cards. A table inside an overflow-x container traps
            vertical swipe gestures on touch, making the page feel unscrollable. */}
        <div className="md:hidden space-y-3">
          {(members || []).map((m: any) => (
            <div key={m.id} className="rounded-2xl border border-text-base/10 bg-text-base/[0.03] p-4">
              <p className="text-text-base font-semibold truncate">{m.name}</p>
              <p className="text-xs text-text-muted truncate mt-0.5">{m.email}</p>
              <div className="flex flex-wrap gap-1.5 my-3">
                {(m.roles || []).map((r: RoleRef) => (
                  <RoleBadge key={r.id} role={r} />
                ))}
                {!(m.roles || []).length && <span className="text-xs text-text-muted/60">No roles</span>}
              </div>
              <button
                onClick={() => openMemberRoles(m)}
                className="w-full text-[13px] font-semibold text-accent border border-accent/40 rounded-xl px-3 py-2 transition-all active:scale-[0.98]"
              >
                Manage roles
              </button>
            </div>
          ))}
          {!(members || []).length && (
            <p className="text-xs text-text-muted/60 text-center py-6">No members yet</p>
          )}
        </div>
        {/* Desktop: table */}
        <div className="hidden md:block glass rounded-2xl overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-text-base/5 border-b border-text-base/10">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Member</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Roles</th>
                <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-base/5">
              {(members || []).map((m: any) => (
                <tr key={m.id} className="hover:bg-text-base/5 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-text-base font-medium">{m.name}</p>
                    <p className="text-xs text-text-muted">{m.email}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(m.roles || []).map((r: RoleRef) => (
                        <RoleBadge key={r.id} role={r} />
                      ))}
                      {!(m.roles || []).length && <span className="text-xs text-text-muted/60">No roles</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openMemberRoles(m)}
                      className="text-[13px] font-semibold text-accent hover:opacity-80 border border-accent/40 rounded-xl px-3 py-1.5 transition-all"
                    >
                      Manage roles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {managingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card-surface p-6 w-full max-w-md shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-text-base">Roles for {managingMember.name}</h3>
              <button
                onClick={() => setManagingMember(null)}
                className="p-1.5 text-text-muted hover:text-text-base transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-text-muted mb-4">Tap a role to assign or revoke it.</p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar">
              {roles.map((role) => {
                const has = memberRoles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    onClick={() => toggleMemberRole(role)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                      has
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-text-base/10 bg-text-base/[0.02] hover:border-text-base/25'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                    <span className={`text-sm font-semibold flex-1 ${has ? 'text-text-base' : 'text-text-base/80'}`}>
                      {role.name}
                    </span>
                    {role.is_system && (
                      <span className="text-[10px] font-bold uppercase text-text-muted/60">System</span>
                    )}
                    <span
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        has ? 'bg-accent border-accent' : 'border-text-base/25'
                      }`}
                    >
                      {has && <X className="w-3.5 h-3.5 rotate-45" style={{ color: '#231A00' }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={() => setManagingMember(null)}
                className="px-4 py-2 rounded-xl bg-elevated text-text-base hover:bg-text-base/10 border border-text-base/10 font-semibold transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
