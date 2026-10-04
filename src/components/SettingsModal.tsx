import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, UserCircle, Users, ShieldCheck, Copy, Check, ImagePlus, Trash2, PhoneCall, Bot, GraduationCap } from 'lucide-react';
import { cn } from './onboarding/onboardingState';
import { apiFetch } from '../services/api';
import { notify, confirmDialog } from './dialog';
import { PRESENCE_META, PresencePicker } from './presence';
import { DeviceSettingsSection } from './voice/DeviceSettingsSection';
import { assetUrl } from '../services/api';
import { Switch, SwitchTrack } from './ui';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGUAGES } from '../i18n';

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

type Section = 'account' | 'voice' | 'bruno' | 'team' | 'roles';

/** The secret NavGPT ❤️ persona only exists for 4215 Hypnotic Robotics. */
function navGptQualifies(teamName: any): boolean {
  const n = String(teamName || '');
  return /hypnotic/i.test(n) || /4215/.test(n);
}

/**
 * Discord-style settings: full-screen overlay, section nav on the left,
 * content on the right. ESC or the X closes it.
 */
export default function SettingsModal({
  open, onClose, user, team, isAdmin, onUserSaved, onTeamSaved, onOpenRoles, onStatusPick,
}: SettingsModalProps) {
  const { t, i18n } = useTranslation();
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
  const [savingPersona, setSavingPersona] = useState(false);
  // Bruno teaching mode: member prefers to be taught, not just handed code.
  const [teachMode, setTeachMode] = useState(false);
  const [savingTeach, setSavingTeach] = useState(false);
  // Bruno output level: low | medium | high | max — caps reply length.
  const [outputLevel, setOutputLevel] = useState('medium');
  const [savingLevel, setSavingLevel] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the forms every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSection('account');
    setName(user?.name || '');
    setRole(user?.role || '');
    setTeachMode(user?.bruno_teach_mode === 1);
    setOutputLevel(user?.bruno_output_level || 'medium');
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

  // Secret persona: NavGPT ❤️ only exists for the qualifying team
  // (name contains "hypnotic" or "4215"). Every other team never sees it —
  // the toggle, the name, and the persona are invisible to them.
  const navGptOn = navGptQualifies(team?.name) && (team?.navgpt_enabled ?? 1) === 1;

  /** Teaching-mode toggle: saved on the member row so Bruno remembers it on
   *  every device. Optimistic UI with revert on failure. */
  const toggleTeachMode = async () => {
    if (savingTeach) return;
    const next = !teachMode;
    setTeachMode(next);
    setSavingTeach(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user?.name || '', role: user?.role || '', bruno_teach_mode: next ? 1 : 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        onUserSaved(data.user);
        notify(next ? 'Teaching mode on — Bruno will walk you through it.' : 'Teaching mode off — Bruno will write the code for you.', 'success');
      } else {
        setTeachMode(!next);
        notify(data.error || 'Could not save.', 'error');
      }
    } catch {
      setTeachMode(!next);
      notify('Could not save.', 'error');
    } finally {
      setSavingTeach(false);
    }
  };

  /** Output-level picker: saved on the member row, caps Bruno's reply length. */
  const changeOutputLevel = async (level: string) => {
    if (savingLevel || level === outputLevel) return;
    const prev = outputLevel;
    setOutputLevel(level);
    setSavingLevel(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: user?.name || '', role: user?.role || '', bruno_output_level: level }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        onUserSaved(data.user);
        notify(`Output length: ${level}.`, 'success');
      } else {
        setOutputLevel(prev);
        notify(data.error || 'Could not save.', 'error');
      }
    } catch {
      setOutputLevel(prev);
      notify('Could not save.', 'error');
    } finally {
      setSavingLevel(false);
    }
  };
  const togglePersona = async () => {
    if (savingPersona) return;
    if (navGptOn && !(await confirmDialog({
      title: 'Turn off NavGPT ❤️?',
      message: 'The team chatbot will go back to being Bruno — the normal persona. You can switch back to NavGPT ❤️ anytime.',
      confirmLabel: 'Turn off',
      cancelLabel: 'Keep NavGPT ❤️',
      danger: true,
    }))) return;
    setSavingPersona(true);
    try {
      const res = await apiFetch('/api/team/chat-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !navGptOn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update persona');
      onTeamSaved({ ...team, navgpt_enabled: data.navgpt_enabled ? 1 : 0 });
      notify(navGptOn ? 'NavGPT ❤️ is off — the chatbot is Bruno again.' : 'NavGPT ❤️ is on.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not update persona', 'error');
    } finally {
      setSavingPersona(false);
    }
  };

  const sections: { id: Section; label: string; icon: any; heading: string }[] = [
    { id: 'account', label: 'My Account', icon: UserCircle, heading: 'USER SETTINGS' },
    { id: 'voice', label: 'Voice & Video', icon: PhoneCall, heading: 'USER SETTINGS' },
    { id: 'bruno', label: 'Bruno AI', icon: Bot, heading: 'USER SETTINGS' },
    ...(isAdmin
      ? [
          { id: 'team' as Section, label: 'Team Overview', icon: Users, heading: 'TEAM SETTINGS' },
          { id: 'roles' as Section, label: 'Roles', icon: ShieldCheck, heading: 'TEAM SETTINGS' },
        ]
      : []),
  ];

  const inputClass =
    'w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all text-sm';

  return (
    <div className="fixed inset-0 z-[70] flex bg-primary" role="dialog" aria-modal="true" aria-label="Settings">
      {/* Left nav — full-screen list on phones, sidebar on desktop */}
      <div className={cn(
        'w-full md:w-60 lg:w-72 flex-shrink-0 bg-secondary md:border-r border-text-base/[0.06] flex-col',
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
                          ? 'bg-text-base/[0.08] text-text-base font-bold'
                          : 'text-text-muted hover:bg-text-base/[0.04] hover:text-text-base font-medium'
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
        <div className="p-4 border-t border-text-base/[0.06]">
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
              className="md:hidden p-2 -ml-2 rounded-xl text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-display font-bold text-text-base truncate">
              {sections.find((s) => s.id === section)?.label}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2.5 rounded-full border border-text-base/10 text-text-muted hover:text-text-base hover:border-text-base/25 hover:rotate-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-10 pb-10">
          <div className="max-w-xl space-y-8">
            {section === 'account' && (
              <>
                <section>
                  <h3 className="text-sm font-bold text-text-base mb-3">Profile picture</h3>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-accent text-accent-ink flex items-center justify-center text-2xl font-bold flex-shrink-0">
                      {user?.avatar_url ? (
                        <img src={assetUrl(user.avatar_url)} alt="" className="w-full h-full object-cover" />
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
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-text-muted hover:text-rose-400 hover:bg-text-base/[0.06] disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-text-base">Details</h3>
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
                  <h3 className="text-sm font-bold text-text-base mb-3">Language</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => setLanguage(lang.code)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                          i18n.language === lang.code
                            ? "bg-accent text-accent-ink"
                            : "bg-text-base/[0.04] text-text-muted hover:bg-text-base/[0.08] hover:text-text-base"
                        )}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-text-base mb-1">Status</h3>
                  <p className="text-xs text-text-muted mb-2">
                    Currently: <span className="text-text-base font-semibold">{PRESENCE_META[user?.presence]?.label || 'Offline'}</span>
                  </p>
                  <div className="bg-secondary border border-text-base/10 rounded-2xl overflow-hidden">
                    <PresencePicker value={user?.presence_status || 'online'} onPick={onStatusPick} />
                  </div>
                </section>
              </>
            )}

            {section === 'voice' && (
              <section className="space-y-6">
                <h3 className="text-sm font-bold text-text-base">Devices</h3>
                <DeviceSettingsSection />
              </section>
            )}

            {section === 'bruno' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-text-base">Bruno AI</h3>
                  <p className="text-xs text-text-muted leading-relaxed mt-1">
                    How Bruno helps you with code. Saved to your account, so it follows you on every device.
                  </p>
                </div>
                <button
                  onClick={() => void toggleTeachMode()}
                  role="switch"
                  aria-checked={teachMode}
                  aria-label="Teaching mode"
                  disabled={savingTeach}
                  className="w-full min-h-[72px] flex items-center gap-4 bg-secondary border border-text-base/10 rounded-2xl p-4 text-left hover:border-text-base/25 active:scale-[0.99] disabled:opacity-60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <span className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <GraduationCap className="w-5 h-5 text-accent" strokeWidth={2.25} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-bold text-text-base">Teaching mode</span>
                    <span className="block text-xs text-text-muted mt-0.5 leading-relaxed">
                      {teachMode
                        ? 'On — Bruno explains the concepts and guides you step by step.'
                        : 'Off — Bruno writes the full code for you.'}
                    </span>
                  </span>
                  <SwitchTrack checked={teachMode} aria-hidden="true" />
                </button>
                <p className="text-xs text-text-muted leading-relaxed">
                  You can always override it in the moment — just tell Bruno “write it for me” or “teach me” in chat.
                </p>
                <div>
                  <h4 className="text-sm font-bold text-text-base mb-1">Output length</h4>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">
                    How long Bruno&apos;s replies can run. Higher levels fix cut-off answers.
                  </p>
                  <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Output length">
                    {(['low', 'medium', 'high', 'max'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        role="radio"
                        aria-checked={outputLevel === lvl}
                        onClick={() => void changeOutputLevel(lvl)}
                        disabled={savingLevel}
                        className={cn(
                          'rounded-xl border px-2 py-2.5 text-[13px] font-bold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60',
                          outputLevel === lvl
                            ? 'bg-accent text-accent-ink border-accent'
                            : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                        )}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted/80 leading-relaxed mt-2">
                    Longer answers use more AI tokens, but at typical team use that&apos;s only a few dollars a month.
                  </p>
                </div>
              </section>
            )}

            {section === 'team' && isAdmin && (
              <>
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-text-base">Workspace</h3>
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
                  <h3 className="text-sm font-bold text-text-base mb-1">Invite code</h3>
                  <p className="text-xs text-text-muted mb-3">Share this code so new members can join the workspace at signup.</p>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 bg-secondary border border-text-base/10 rounded-xl px-4 py-3 font-mono text-lg font-bold text-accent tracking-[0.15em] text-center">
                      {team?.access_code || '—'}
                    </code>
                    <button
                      onClick={() => void copyAccessCode()}
                      className="p-3 rounded-xl bg-text-base/[0.06] text-text-muted hover:text-text-base transition-colors"
                      title="Copy invite code"
                    >
                      {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </section>

                {navGptQualifies(team?.name) && (
                  <section>
                    <h3 className="text-sm font-bold text-text-base mb-1">Chatbot Persona</h3>
                    <p className="text-xs text-text-muted mb-3">Who answers in the team chatbot.</p>
                    <div className="flex items-center gap-4 bg-secondary border border-text-base/10 rounded-2xl p-4">
                      <Switch
                        checked={!!navGptOn}
                        label="NavGPT ❤️"
                        disabled={savingPersona}
                        onChange={() => void togglePersona()}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-text-base">NavGPT ❤️</p>
                        <p className="text-xs text-text-muted leading-relaxed">
                          {navGptOn
                            ? 'On — the chatbot answers as NavGPT ❤️. Turn it off to go back to the normal Bruno persona.'
                            : 'Off — the chatbot is the normal Bruno. Flip the switch to bring back NavGPT ❤️.'}
                        </p>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}

            {section === 'roles' && isAdmin && (
              <section>
                <h3 className="text-sm font-bold text-text-base mb-1">Roles & permissions</h3>
                <p className="text-sm text-text-muted leading-relaxed mb-4">
                  Create roles like <span className="text-text-base font-semibold">Build Captain</span> or{' '}
                  <span className="text-text-base font-semibold">Treasurer</span> and choose exactly what each role can
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
