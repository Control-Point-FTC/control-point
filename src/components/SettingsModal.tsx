import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, UserCircle, Users, ShieldCheck, Copy, Check, ImagePlus, Trash2 } from 'lucide-react';
import { cn } from './onboarding/onboardingState';
import { apiFetch } from '../services/api';
import { notify } from './dialog';
import { PRESENCE_META, PresencePicker } from './presence';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  user: any;
  team: any;
  isAdmin: boolean;
  /** Persisted user after a save — parent refreshes its own state. */
  onUserSaved: (user: any) => void;
  onTeamSaved: (team: any) => void;
  onOpenRoles: () => void;
  onStatusPick: (status: string) => void;
}

type Section = 'account' | 'team' | 'roles';

/**
 * Discord-style settings: full-screen overlay, section nav on the left,
 * content on the right. ESC or the X closes it.
 */
export default function SettingsModal({
  open, onClose, user, team, isAdmin, onUserSaved, onTeamSaved, onOpenRoles, onStatusPick,
}: SettingsModalProps) {
  const [section, setSection] = useState<Section>('account');
  // On phones the nav and content can't sit side-by-side — drill in instead.
  const [mobileNav, setMobileNav] = useState(true);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [ftcNumber, setFtcNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the forms every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSection('account');
    setName(user?.name || '');
    setRole(user?.role || '');
    setTeamName(team?.name || '');
    setTeamNumber(team?.number || '');
    setFtcNumber(team?.ftc_team_number ? String(team.ftc_team_number) : '');
    setCopied(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes, like Discord.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const saveAccount = async () => {
    if (!name.trim()) { notify("Name can't be empty.", 'error'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved(data.user); notify('Profile saved.', 'success'); }
      else notify(data.error || 'Could not save.', 'error');
    } catch {
      notify('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveTeam = async () => {
    if (!team?.id) return;
    setSaving(true);
    try {
      const body: any = { name: teamName.trim() };
      if (teamNumber.trim()) body.number = teamNumber.trim();
      body.ftc_team_number = ftcNumber.trim() === '' ? null : parseInt(ftcNumber.trim(), 10);
      const res = await apiFetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { onTeamSaved(data.team || { ...team, ...body }); notify('Team settings saved.', 'success'); }
      else notify(data.error || 'Could not save team settings.', 'error');
    } catch {
      notify('Could not save team settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify('Please choose an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { notify('Image must be under 2 MB.', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await apiFetch('/api/profile/avatar', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved(data.user); notify('Profile picture updated.', 'success'); }
      else notify(data.error || 'Could not upload that picture.', 'error');
    } catch {
      notify('Could not upload that picture.', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user?.name || '', role: user?.role || '', avatar_url: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) { onUserSaved(data.user); notify('Profile picture removed.', 'success'); }
      else notify(data.error || 'Could not remove picture.', 'error');
    } catch {
      notify('Could not remove picture.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyAccessCode = async () => {
    try {
      await navigator.clipboard.writeText(team?.access_code || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const sections: { id: Section; label: string; icon: any; heading: string }[] = [
    { id: 'account', label: 'My Account', icon: UserCircle, heading: 'USER SETTINGS' },
    ...(isAdmin
      ? [
          { id: 'team' as Section, label: 'Team Overview', icon: Users, heading: 'TEAM SETTINGS' },
          { id: 'roles' as Section, label: 'Roles', icon: ShieldCheck, heading: 'TEAM SETTINGS' },
        ]
      : []),
  ];

  const inputClass =
    'w-full bg-primary border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm';

  return (
    <div className="fixed inset-0 z-[70] flex bg-primary" role="dialog" aria-modal="true" aria-label="Settings">
      {/* Left nav — full-screen list on phones, sidebar on desktop */}
      <div className={cn(
        'w-full md:w-60 lg:w-72 flex-shrink-0 bg-secondary md:border-r border-white/[0.06] flex-col',
        mobileNav ? 'flex' : 'hidden md:flex'
      )}>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
          {['USER SETTINGS', 'TEAM SETTINGS'].map((heading) => {
            const items = sections.filter((s) => s.heading === heading);
            if (!items.length) return null;
            return (
              <div key={heading} className="mb-6">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">{heading}</p>
                <div className="space-y-1">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSection(s.id); setMobileNav(false); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                        section === s.id
                          ? 'bg-white/[0.08] text-white font-bold'
                          : 'text-text-muted hover:bg-white/[0.04] hover:text-white font-medium'
                      )}
                    >
                      <s.icon className={cn('w-[18px] h-[18px] shrink-0', section === s.id ? 'text-accent' : 'text-accent/70')} strokeWidth={2.25} />
                      <span className="truncate">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-white/[0.06]">
          <p className="text-[11px] text-text-muted/60 text-center">Control Point settings</p>
        </div>
      </div>

      {/* Content — full-screen drill-in on phones, pane on desktop */}
      <div className={cn('flex-1 flex-col min-w-0', mobileNav ? 'hidden md:flex' : 'flex')}>
        <div className="flex items-center justify-between px-4 sm:px-10 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setMobileNav(true)}
              aria-label="Back to settings list"
              className="md:hidden p-2 -ml-2 rounded-xl text-text-muted hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-bold text-white truncate">
              {sections.find((s) => s.id === section)?.label}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2.5 rounded-full border border-white/10 text-text-muted hover:text-white hover:border-white/25 hover:rotate-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-10 pb-10">
          <div className="max-w-xl space-y-8">
            {section === 'account' && (
              <>
                <section>
                  <h3 className="text-sm font-bold text-white mb-3">Profile picture</h3>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-accent text-accent-ink flex items-center justify-center text-2xl font-bold flex-shrink-0">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (user?.name || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleAvatarFile(e.target.files?.[0])} />
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-50 transition-all flex items-center gap-2"
                      >
                        <ImagePlus className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Change picture'}
                      </button>
                      {user?.avatar_url && (
                        <button
                          onClick={() => void removeAvatar()}
                          disabled={saving}
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-text-muted hover:text-rose-400 hover:bg-white/[0.06] disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-white">Details</h3>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Display name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Role / title</label>
                    <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="e.g. Build Captain" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Email</label>
                    <input value={user?.email || ''} disabled className={cn(inputClass, 'opacity-50 cursor-not-allowed')} />
                  </div>
                  <button
                    onClick={() => void saveAccount()}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-white mb-1">Status</h3>
                  <p className="text-xs text-text-muted mb-2">
                    Currently: <span className="text-white font-semibold">{PRESENCE_META[user?.presence]?.label || 'Offline'}</span>
                  </p>
                  <div className="bg-secondary border border-white/10 rounded-2xl overflow-hidden">
                    <PresencePicker value={user?.presence_status || 'online'} onPick={onStatusPick} />
                  </div>
                </section>
              </>
            )}

            {section === 'team' && isAdmin && (
              <>
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-white">Workspace</h3>
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Team name</label>
                    <input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={80} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Team number</label>
                      <input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} maxLength={20} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">FTC team #</label>
                      <input value={ftcNumber} onChange={(e) => setFtcNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 33950" className={inputClass} />
                    </div>
                  </div>
                  <button
                    onClick={() => void saveTeam()}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-white mb-1">Invite code</h3>
                  <p className="text-xs text-text-muted mb-3">Share this code so new members can join the workspace at signup.</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 bg-secondary border border-white/10 rounded-xl px-4 py-3 font-mono text-lg font-bold text-accent tracking-[0.15em] text-center">
                      {team?.access_code || '—'}
                    </code>
                    <button
                      onClick={() => void copyAccessCode()}
                      className="p-3 rounded-xl bg-white/[0.06] text-text-muted hover:text-white transition-colors"
                      title="Copy invite code"
                    >
                      {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </section>
              </>
            )}

            {section === 'roles' && isAdmin && (
              <section>
                <h3 className="text-sm font-bold text-white mb-1">Roles & permissions</h3>
                <p className="text-sm text-text-muted leading-relaxed mb-4">
                  Create roles like <span className="text-white font-semibold">Build Captain</span> or{' '}
                  <span className="text-white font-semibold">Treasurer</span> and choose exactly what each role can
                  touch — attendance, budget, tasks, inventory, code, and more.
                </p>
                <button
                  onClick={onOpenRoles}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" /> Open Roles
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
