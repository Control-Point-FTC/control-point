// VoiceChannelAdmin — voice channel management for team admins.
// Create / rename / delete (with a confirm explaining participants get
// kicked) / reorder, plus per-channel settings and the per-role permission
// matrix (view / join / speak / video / screenshare) via
// GET/PUT /api/voice/channels/:id/role-perms.
// Everything is gated on canManageVoice — without it this renders nothing.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { cn } from '../ui';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { useVoice, voiceAdminApi, type RolePermRow, type VoiceChannelSummary } from '../../voice';
import { VoiceIconButton } from './shared';
import { Select as ThemedSelect } from '../Select';

const PERM_COLS = [
  { key: 'can_view', label: 'View' },
  { key: 'can_join', label: 'Join' },
  { key: 'can_speak', label: 'Speak' },
  { key: 'can_video', label: 'Video' },
  { key: 'can_screenshare', label: 'Screenshare' },
] as const;

interface ChannelForm {
  name: string;
  description: string;
  max_participants: string;
  is_private: boolean;
  locked: boolean;
  allow_video: boolean;
  allow_screenshare: boolean;
  category_id: string;
}

const emptyForm = (): ChannelForm => ({
  name: '',
  description: '',
  max_participants: '0',
  is_private: false,
  locked: false,
  allow_video: true,
  allow_screenshare: true,
  category_id: '',
});

function FormToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
    >
      <span className="text-sm text-text-base">{label}</span>
      <span aria-hidden="true" className={cn('relative w-10 h-6 rounded-full transition-colors flex-shrink-0', checked ? 'bg-accent' : 'bg-text-base/15')}>
        <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

const inputCls =
  'w-full bg-secondary border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent';

export function VoiceChannelAdmin({
  categories = [],
}: {
  /** Optional chat categories for grouping voice channels: [{id, name}]. */
  categories?: Array<{ id: number; name: string }>;
}) {
  const { channels, canManageVoice, refreshChannels } = useVoice();
  const [formFor, setFormFor] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<ChannelForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [permsFor, setPermsFor] = useState<number | null>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [permRows, setPermRows] = useState<RolePermRow[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);

  // Everything below is admin-only.
  useEffect(() => {
    if (!canManageVoice) return;
    apiFetch('/api/roles')
      .then((r) => r.json())
      .then((d) => setRoles(Array.isArray(d) ? d : d.roles ?? []))
      .catch(() => {});
  }, [canManageVoice]);

  const openForm = (channel: VoiceChannelSummary | null) => {
    if (channel) {
      setForm({
        name: channel.name,
        description: channel.description || '',
        max_participants: String(channel.maxParticipants ?? 0),
        is_private: !!channel.isPrivate,
        locked: !!channel.locked,
        allow_video: true,
        allow_screenshare: true,
        category_id: '',
      });
      setFormFor(channel.id);
    } else {
      setForm(emptyForm());
      setFormFor('new');
    }
  };

  const saveForm = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body: any = {
        name: form.name.trim(),
        description: form.description.trim(),
        max_participants: Math.max(0, Math.min(100, parseInt(form.max_participants, 10) || 0)),
        is_private: form.is_private,
        locked: form.locked,
        allow_video: form.allow_video,
        allow_screenshare: form.allow_screenshare,
        ...(form.category_id ? { category_id: Number(form.category_id) } : {}),
      };
      if (formFor === 'new') await voiceAdminApi.createChannel(body);
      else await voiceAdminApi.patchChannel(Number(formFor), body);
      setFormFor(null);
      await refreshChannels();
      notify(formFor === 'new' ? 'Voice channel created.' : 'Voice channel updated.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Could not save the voice channel.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (channel: VoiceChannelSummary) => {
    const active = channel.participantCount > 0;
    const ok = await confirmDialog({
      title: `Delete "${channel.name}"?`,
      message: active
        ? `${channel.participantCount} ${channel.participantCount === 1 ? 'person is' : 'people are'} in this channel right now — they will be kicked immediately. This can't be undone.`
        : 'This channel and its settings will be removed. This can\'t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await voiceAdminApi.deleteChannel(channel.id);
      await refreshChannels();
      notify('Voice channel deleted.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Could not delete the voice channel.', 'error');
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...channels];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    try {
      await voiceAdminApi.reorderChannels(next.map((c) => c.id));
      await refreshChannels();
    } catch (err: any) {
      notify(err?.message || 'Could not reorder channels.', 'error');
    }
  };

  const openPerms = useCallback(
    async (channelId: number) => {
      setPermsFor(channelId);
      setPermsLoading(true);
      try {
        const rows = await voiceAdminApi.getRolePerms(channelId);
        setPermRows(
          rows.map((r: any) => ({
            role_id: Number(r.role_id),
            can_view: !!r.can_view,
            can_join: !!r.can_join,
            can_speak: !!r.can_speak,
            can_video: !!r.can_video,
            can_screenshare: !!r.can_screenshare,
          })),
        );
      } catch (err: any) {
        notify(err?.message || 'Could not load role permissions.', 'error');
        setPermsFor(null);
      } finally {
        setPermsLoading(false);
      }
    },
    [],
  );

  const togglePerm = (roleId: number, key: (typeof PERM_COLS)[number]['key']) => {
    setPermRows((prev) => {
      const existing = prev.find((r) => r.role_id === roleId);
      if (existing) {
        return prev.map((r) => (r.role_id === roleId ? { ...r, [key]: !r[key] } : r));
      }
      return [...prev, { role_id: roleId, can_view: false, can_join: false, can_speak: false, can_video: false, can_screenshare: false, [key]: true }];
    });
  };

  const savePerms = async () => {
    if (permsFor == null) return;
    setPermsSaving(true);
    try {
      await voiceAdminApi.putRolePerms(permsFor, permRows);
      notify('Role permissions saved.', 'success');
      setPermsFor(null);
    } catch (err: any) {
      notify(err?.message || 'Could not save role permissions.', 'error');
    } finally {
      setPermsSaving(false);
    }
  };

  if (!canManageVoice) return null;

  const editingChannel = formFor !== null && formFor !== 'new' ? channels.find((c) => c.id === formFor) : null;

  return (
    <section aria-label="Voice channel administration" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-text-base flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-accent" aria-hidden="true" />
          Voice channels
        </h3>
        <button
          type="button"
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-accent text-accent-ink hover:brightness-105 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New channel
        </button>
      </div>

      {channels.length === 0 && (
        <p className="text-sm text-text-muted">No voice channels yet — create one to get started.</p>
      )}

      <ul className="space-y-2">
        {channels.map((c, i) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-xl bg-text-base/[0.04] border border-text-base/[0.06] px-3 py-2"
          >
            <span className="flex items-center gap-1" role="group" aria-label={`Reorder ${c.name}`}>
              <VoiceIconButton label={`Move ${c.name} up`} onClick={() => void move(i, -1)} disabled={i === 0} className="p-1.5">
                <ArrowUp className="w-3.5 h-3.5" />
              </VoiceIconButton>
              <VoiceIconButton label={`Move ${c.name} down`} onClick={() => void move(i, 1)} disabled={i === channels.length - 1} className="p-1.5">
                <ArrowDown className="w-3.5 h-3.5" />
              </VoiceIconButton>
            </span>
            <Volume2 className="w-4 h-4 text-text-muted/60 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-base truncate">{c.name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                {c.locked && (
                  <span className="inline-flex items-center gap-0.5 text-amber-300">
                    <Lock className="w-3 h-3" aria-hidden="true" /> Locked
                  </span>
                )}
                {c.isPrivate && (
                  <span className="inline-flex items-center gap-0.5">
                    <EyeOff className="w-3 h-3" aria-hidden="true" /> Private
                  </span>
                )}
                {c.participantCount > 0 && (
                  <span>{c.participantCount} in call</span>
                )}
                {c.maxParticipants > 0 && <span>· max {c.maxParticipants}</span>}
              </span>
            </span>
            <VoiceIconButton label={`Role permissions for ${c.name}`} onClick={() => void openPerms(c.id)} className="p-1.5">
              <Users className="w-4 h-4" />
            </VoiceIconButton>
            <VoiceIconButton label={`Edit ${c.name}`} onClick={() => openForm(c)} className="p-1.5">
              <Pencil className="w-4 h-4" />
            </VoiceIconButton>
            <VoiceIconButton label={`Delete ${c.name}`} onClick={() => void handleDelete(c)} className="p-1.5 hover:!text-rose-400">
              <Trash2 className="w-4 h-4" />
            </VoiceIconButton>
          </li>
        ))}
      </ul>

      {/* ------------------------------------------------ create / rename */}
      {formFor !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={formFor === 'new' ? 'Create voice channel' : `Edit ${editingChannel?.name ?? 'voice channel'}`}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFormFor(null)} aria-hidden="true" />
          <div className="relative w-full max-w-md bg-elevated border border-text-base/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-base">
                {formFor === 'new' ? 'Create voice channel' : `Edit ${editingChannel?.name ?? ''}`}
              </h3>
              <VoiceIconButton label="Close" onClick={() => setFormFor(null)} className="p-2">
                <X className="w-4 h-4" />
              </VoiceIconButton>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vc-name" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Name</label>
              <input id="vc-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} placeholder="e.g. Build room" autoFocus />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="vc-desc" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Description</label>
              <input id="vc-desc" className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={140} placeholder="What is this channel for?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="vc-max" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Max people (0 = unlimited)</label>
                <input id="vc-max" type="number" min={0} max={100} className={inputCls} value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} />
              </div>
              {categories.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="vc-cat" className="text-xs font-semibold text-text-muted uppercase tracking-wider">Category</label>
                  <ThemedSelect id="vc-cat" className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">None</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </ThemedSelect>
                </div>
              )}
            </div>
            <div className="divide-y divide-text-base/[0.06]">
              <FormToggle label="Private (role-gated)" checked={form.is_private} onChange={(v) => setForm({ ...form, is_private: v })} />
              <FormToggle label="Locked (no new joins)" checked={form.locked} onChange={(v) => setForm({ ...form, locked: v })} />
              <FormToggle label="Allow video" checked={form.allow_video} onChange={(v) => setForm({ ...form, allow_video: v })} />
              <FormToggle label="Allow screen sharing" checked={form.allow_screenshare} onChange={(v) => setForm({ ...form, allow_screenshare: v })} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormFor(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveForm()}
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {saving ? 'Saving…' : formFor === 'new' ? 'Create channel' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ permission matrix */}
      {permsFor != null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Role permissions">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPermsFor(null)} aria-hidden="true" />
          <div className="relative w-full max-w-2xl bg-elevated border border-text-base/10 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-base">
                Role permissions — {channels.find((c) => c.id === permsFor)?.name}
              </h3>
              <VoiceIconButton label="Close" onClick={() => setPermsFor(null)} className="p-2">
                <X className="w-4 h-4" />
              </VoiceIconButton>
            </div>
            <p className="text-xs text-text-muted">
              Control what each role can do in this channel. Unset rows fall back to the server default (members can view and join).
            </p>
            {permsLoading ? (
              <p className="text-sm text-text-muted py-6 text-center">Loading…</p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-text-muted py-6 text-center">No roles found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted">
                      <th scope="col" className="py-2 pr-2 font-semibold">Role</th>
                      {PERM_COLS.map((c) => (
                        <th key={c.key} scope="col" className="py-2 px-2 font-semibold text-center">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-base/[0.06]">
                    {roles.map((role: any) => {
                      const row = permRows.find((r) => r.role_id === role.id);
                      return (
                        <tr key={role.id}>
                          <td className="py-2 pr-2 text-text-base font-semibold">{role.name}</td>
                          {PERM_COLS.map((c) => (
                            <td key={c.key} className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={!!row?.[c.key]}
                                onChange={() => togglePerm(role.id, c.key)}
                                aria-label={`${c.label} for role ${role.name}`}
                                className="w-4 h-4 accent-[#FFC700] cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPermsFor(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePerms()}
                disabled={permsSaving || permsLoading}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {permsSaving ? 'Saving…' : 'Save permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default VoiceChannelAdmin;
