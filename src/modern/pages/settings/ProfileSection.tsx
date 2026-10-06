// Settings → Profile: picture, name, title, personal accent, status, and the
// read-only account facts. Name/title/accent are drafted (they survive a
// Legacy/Modern switch) and the accent previews live, like /profile did.
import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Input, Label } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { PRESENCE_SETTINGS, PRESENCE_SETTING_META } from '../../../components/presence';
import { getDraft, useDraft } from '../../drafts';
import { MemberAvatar } from '../tasks/AssigneePicker';
import { SettingsGroup, SettingsRow } from './SettingsPage';

interface ProfileDraft { name: string; role: string; accent: string }
const validHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
const PRESENCE_DOT: Record<string, string> = { online: 'bg-success', idle: 'bg-warning', dnd: 'bg-destructive', invisible: 'bg-muted-foreground/50' };

function parseScopes(raw: unknown): string[] {
  let s = raw;
  for (let i = 0; i < 2 && typeof s === 'string'; i++) { try { s = JSON.parse(s); } catch { return []; } }
  return Array.isArray(s) ? s : [];
}

export function ProfileSection({ currentUser, teams = [], onUserSaved, onStatusPick, setColorVersion, refresh }: any) {
  const user = currentUser || {};
  const draftKey = `settings:profile:${user.id ?? 0}`;
  const [draft, setDraft] = useDraft<ProfileDraft | null>(draftKey, null);
  const form: ProfileDraft = draft ?? { name: user.name || '', role: user.role || '', accent: user.accent_color || '' };
  const set = (patch: Partial<ProfileDraft>) => setDraft({ ...form, ...patch });
  const dirty = !!draft && (form.name !== (user.name || '') || form.role !== (user.role || '') || form.accent !== (user.accent_color || ''));
  const nameError = !form.name.trim() ? "Name can't be empty." : form.name.trim().length > 60 ? 'Name must be 60 characters or fewer.' : null;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const team = teams.find((t: any) => t.id === user.team_id);

  // Live accent preview while editing; back to the saved accent otherwise.
  // An empty drafted accent means "team default" — exactly what Save sends.
  useEffect(() => {
    const root = document.documentElement;
    const candidates = draft ? [form.accent, team?.accent_color] : [user.accent_color, team?.accent_color];
    const apply = candidates.find(validHex)?.trim();
    if (apply) root.style.setProperty('--color-accent', apply); else root.style.removeProperty('--color-accent');
    setColorVersion?.((v: number) => v + 1);
  }, [draft?.accent, user.accent_color, team?.accent_color]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (nameError) return;
    // Remember exactly what was submitted: if the user keeps editing while
    // this is in flight, a late success must not wipe the newer draft.
    const submitted = draft;
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), role: form.role.trim(), accent_color: form.accent.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || 'Could not save.', 'error'); return; }
      if (data.user) onUserSaved?.(data.user);
      refresh?.members?.();
      if (getDraft(draftKey, null) === submitted) {
        setDraft(null);
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 2500);
      }
      notify('Profile saved.', 'success');
    } catch {
      notify('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify('Please choose an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { notify('Image must be under 2 MB.', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await apiFetch('/api/profile/avatar', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved?.(data.user); refresh?.members?.(); notify('Profile picture updated.', 'success'); }
      else notify(data.error || 'Could not upload that picture.', 'error');
    } catch {
      notify('Could not upload that picture.', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user.name || '', role: user.role || '', avatar_url: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved?.(data.user); refresh?.members?.(); notify('Profile picture removed.', 'success'); }
      else notify(data.error || 'Could not remove picture.', 'error');
    } catch {
      notify('Could not remove picture.', 'error');
    }
  };

  const resetTheme = async () => {
    try {
      const res = await apiFetch('/api/theme/reset', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reset theme');
      // Apply the reset before dropping the draft, so the preview doesn't
      // snap back to the old saved accent.
      onUserSaved?.(data.user ?? { ...user, accent_color: null });
      refresh?.teams?.();
      // Only the colours were reset — keep any unsaved name/title edits.
      const cur = getDraft<ProfileDraft | null>(draftKey, null);
      if (cur) setDraft({ ...cur, accent: '' });
      const root = document.documentElement;
      root.style.removeProperty('--color-accent');
      root.style.removeProperty('--color-primary');
      root.style.removeProperty('--color-text-base');
      setColorVersion?.((v: number) => v + 1);
      refresh?.settings?.();
      notify('Theme reset to the default Volt & Carbon colors.', 'success');
    } catch (e: any) {
      notify(e.message || 'Could not reset theme', 'error');
    }
  };

  const scopes = parseScopes(user.scopes);
  const status = user.presence_status || 'online';

  return (
    <div>
      <SettingsGroup title="Picture">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <MemberAvatar member={user} className="size-16 border-0 text-lg" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadAvatar(e.target.files?.[0])} aria-label="Upload profile picture" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="max-sm:h-11">
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} Change picture
            </Button>
            {user.avatar_url && <Button variant="ghost" onClick={() => void removeAvatar()} className="text-destructive hover:text-destructive max-sm:h-11"><Trash2 /> Remove</Button>}
          </div>
          <p className="w-full text-xs text-muted-foreground">PNG, JPG or GIF, up to 2 MB.</p>
        </div>
      </SettingsGroup>

      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <SettingsGroup title="Details" description="How you appear to your team.">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input id="profile-name" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-invalid={!!nameError} />
              {nameError && <p className="text-xs text-destructive" role="alert">{nameError}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-role">Title</Label>
              <Input id="profile-role" value={form.role} maxLength={80} onChange={(e) => set({ role: e.target.value })} placeholder="e.g. Build Captain" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="profile-accent">Personal accent</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input type="color" aria-label="Pick accent colour" className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5" value={validHex(form.accent) ? form.accent : '#FFC700'} onChange={(e) => set({ accent: e.target.value })} />
                <Input id="profile-accent" value={form.accent} onChange={(e) => set({ accent: e.target.value })} placeholder="Team default" className="w-36 font-mono" />
                {form.accent && <Button type="button" variant="ghost" size="sm" onClick={() => set({ accent: '' })}><RotateCcw /> Use team default</Button>}
              </div>
              <p className="text-xs text-muted-foreground">Previews as you type. Leave empty to follow your team’s colour.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
            {justSaved && <span className="mr-auto flex items-center gap-1.5 text-sm text-success"><Check className="size-4" /> Saved</span>}
            {dirty && !justSaved && <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>}
            {dirty && <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Discard</Button>}
            <Button type="submit" disabled={!dirty || !!nameError || saving}>{saving && <Loader2 className="animate-spin" />} Save changes</Button>
          </div>
        </SettingsGroup>
      </form>

      <SettingsGroup title="Status" description="Shown next to your name everywhere.">
        <div role="radiogroup" aria-label="Status" className="grid gap-2 p-4 sm:grid-cols-2">
          {PRESENCE_SETTINGS.map((p) => {
            const meta = PRESENCE_SETTING_META[p];
            const on = status === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onStatusPick?.(p)}
                className={cn('flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'border-accent/60 bg-accent/5' : 'border-border hover:bg-muted/50')}
              >
                <span className={cn('size-2.5 rounded-full', PRESENCE_DOT[p])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{meta.label}</span>
                  <span className="block text-xs text-muted-foreground">{meta.desc}</span>
                </span>
                {on && <Check className="size-4 text-accent" />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Account facts">
        <SettingsRow label="Email" description="Used to sign in. Contact an admin to change it."><span className="text-sm">{user.email || '—'}</span></SettingsRow>
        <SettingsRow label="Account type"><Badge variant={user.is_board ? 'soft' : 'outline'}>{user.is_board ? 'Board member' : 'Team member'}</Badge></SettingsRow>
        <SettingsRow label="Admin scopes">
          <span className="flex flex-wrap justify-end gap-1">{scopes.length ? scopes.map((s) => <Badge key={s} variant="outline">{s}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}</span>
        </SettingsRow>
        <SettingsRow label="Colours" description="Clears custom colours and goes back to Volt & Carbon.">
          <Button variant="outline" size="sm" onClick={() => void resetTheme()}>Reset theme</Button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
