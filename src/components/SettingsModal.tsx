import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronDown, UserCircle, Users, ShieldCheck, Copy, Check, ImagePlus, Trash2, PhoneCall, Bot, GraduationCap, Palette, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from './onboarding/onboardingState';
import { apiFetch } from '../services/api';
import { notify, confirmDialog } from './dialog';
import { PRESENCE_META, PresencePicker } from './presence';
import { DeviceSettingsSection } from './voice/DeviceSettingsSection';
import { assetUrl } from '../services/api';
import { Switch, SwitchTrack } from './ui';
import { useTranslation } from 'react-i18next';
import ThemePicker from './ThemePicker';
import { setLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { soundsEnabled, setSoundsEnabled } from '../utils/sounds';
import { WhatsNewModal } from './WhatsNewModal';
import { CURRENT_VERSION } from '../utils/changelog';
import { InterfaceModePicker, WorkspaceInterfaceDefault } from '../modern/InterfaceModePicker';
import { DashboardPreview } from './DashboardPreview';

/** Click-to-edit numeric value for appearance sliders. */
function EditableSliderValue({ value, min, max, step, unit, onChange, label }: {
  value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = step >= 1 ? String(Math.round(value)) : String(Math.round(value * 100) / 100);

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      // Snap to the nearest valid step so typed values match slider positions
      const snapped = Math.round(clamped / step) * step;
      // Round to avoid floating-point artifacts (e.g. 0.1 + 0.2)
      const decimals = Math.max(0, -Math.floor(Math.log10(step)));
      onChange(Number(snapped.toFixed(decimals)));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-16 text-xs text-text-base font-mono bg-text-base/[0.06] border border-accent/40 rounded-lg px-2 py-1 text-right focus:outline-none"
        aria-label={`Edit ${label}`}
      />
    );
  }
  return (
    <button
      onClick={() => { setDraft(display); setEditing(true); }}
      className="text-xs text-text-muted font-mono hover:text-accent hover:underline underline-offset-2 transition-colors cursor-text"
      title={`Click to type a value (${min}–${max}${unit})`}
      aria-label={`${label}: ${display}${unit}. Click to edit.`}
    >
      {display}{unit}
    </button>
  );
}
import { DEFAULT_PULSE_ORIGINS, PULSE_ORIGIN_OPTIONS, applyPulseOrigins, readPulseOrigins, writePulseOrigins, type PulseOrigins } from '../utils/gridPulse';

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

type Section = 'account' | 'appearance' | 'voice' | 'bruno' | 'team' | 'roles';

/** The secret NavGPT ❤️ persona only exists for 4215 Hypnotic Robotics. */
function navGptQualifies(teamName: any): boolean {
  const n = String(teamName || '');
  return /hypnotic/i.test(n) || /4215/.test(n);
}

/**
 * Discord-style settings: full-screen overlay, section nav on the left,
 * content on the right. ESC or the X closes it.
 */
function SoundToggle() {
  const [enabled, setEnabled] = useState(() => soundsEnabled());
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
      <div>
        <p className="text-sm font-semibold text-text-base">Notification &amp; call sounds</p>
        <p className="text-xs text-text-muted mt-0.5">
          Play a chime for notifications and a ringtone for incoming calls
        </p>
      </div>
      <Switch
        checked={enabled}
        onChange={(v) => {
          setEnabled(v);
          setSoundsEnabled(v);
        }}
        label="Notification & call sounds"
      />
    </div>
  );
}

/** Camera default: 'ask' | 'on' | 'off'. Camera never turns on automatically —
 *  this controls whether joining asks, always enables, or stays off. */
export type CameraDefault = 'ask' | 'on' | 'off';
export function getCameraDefault(): CameraDefault {
  try {
    const v = localStorage.getItem('controlpoint-camera-default');
    if (v === 'on' || v === 'off' || v === 'ask') return v;
  } catch {}
  return 'ask';
}
export function setCameraDefault(v: CameraDefault) {
  try { localStorage.setItem('controlpoint-camera-default', v); } catch {}
}

function CameraDefaultSetting() {
  const [value, setValue] = useState<CameraDefault>(() => getCameraDefault());
  const options: { id: CameraDefault; label: string; desc: string }[] = [
    { id: 'ask', label: 'Ask each time', desc: 'Prompt when joining a channel' },
    { id: 'on', label: 'Always on', desc: 'Join with camera enabled' },
    { id: 'off', label: 'Always off', desc: 'Join audio-only; toggle camera manually' },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Camera default">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          title={opt.desc}
          onClick={() => {
            setValue(opt.id);
            setCameraDefault(opt.id);
          }}
          className={cn(
            'rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            value === opt.id
              ? 'bg-accent text-accent-ink border-accent'
              : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PasswordChangeForm({ inputClass }: { inputClass: string }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    if (nw !== nw2) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    if (nw.length < 6) { setMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' });
        setCur(''); setNw(''); setNw2('');
      } else {
        setMsg({ ok: false, text: data.error || 'Could not change password.' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 max-w-sm">
      <div>
        <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Current password</label>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className={inputClass} />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">New password</label>
        <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" className={inputClass} />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Confirm new password</label>
        <input type="password" value={nw2} onChange={(e) => setNw2(e.target.value)} autoComplete="new-password" className={inputClass} />
      </div>
      {msg && (
        <p className={cn('text-xs font-medium', msg.ok ? 'text-emerald-400' : 'text-rose-400')}>{msg.text}</p>
      )}
      <button
        onClick={() => void submit()}
        disabled={busy || !cur || !nw || !nw2}
        className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
      >
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </div>
  );
}

export default function SettingsModal({
  open, onClose, user, team, isAdmin, onUserSaved, onTeamSaved, onOpenRoles, onStatusPick,
}: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  // Grid appearance settings — all persisted to localStorage and applied as CSS vars
  const [gridEnabled, setGridEnabled] = useState(() => localStorage.getItem('controlpoint-grid-enabled') !== '0');
  const [gridSize, setGridSize] = useState(() => Number(localStorage.getItem('controlpoint-grid-size')) || 32);
  const [gridOpacity, setGridOpacity] = useState(() => Number(localStorage.getItem('controlpoint-grid-opacity')) || 0.12);
  const [gridPulseEnabled, setGridPulseEnabled] = useState(
    () => localStorage.getItem('controlpoint-grid-pulse') !== '0'
  );
  const [gridPulseSpeed, setGridPulseSpeed] = useState(() => Number(localStorage.getItem('controlpoint-grid-pulse-speed')) || 6);
  const [gridPulseOpacity, setGridPulseOpacity] = useState(() => Number(localStorage.getItem('controlpoint-grid-pulse-opacity')) || 0.22);
  // Where the pulse glows from: any non-empty mix of centre, edges, corners.
  const [gridPulseOrigins, setGridPulseOrigins] = useState<PulseOrigins>(() => readPulseOrigins(localStorage.getItem('controlpoint-grid-pulse-origins')));
  const [gridGlowEnabled, setGridGlowEnabled] = useState(() => localStorage.getItem('controlpoint-grid-glow') !== '0');
  const [gridGlowSize, setGridGlowSize] = useState(() => Number(localStorage.getItem('controlpoint-grid-glow-size')) || 280);
  const [gridGlowOpacity, setGridGlowOpacity] = useState(() => Number(localStorage.getItem('controlpoint-grid-glow-opacity')) || 0.25);

  // Apply grid settings to CSS variables and classes
  const applyGridSettings = (s: {
    enabled: boolean; size: number; opacity: number;
    pulse: boolean; pulseSpeed: number; pulseOpacity: number; pulseOrigins: PulseOrigins;
    glow: boolean; glowSize: number; glowOpacity: number;
  }) => {
    const root = document.documentElement;
    root.classList.toggle('grid-off', !s.enabled);
    root.classList.toggle('grid-pulse-off', !s.pulse);
    root.classList.toggle('grid-glow-off', !s.glow);
    root.style.setProperty('--grid-size', `${s.size}px`);
    root.style.setProperty('--grid-opacity', String(s.opacity));
    root.style.setProperty('--grid-pulse-speed', `${s.pulseSpeed}s`);
    root.style.setProperty('--grid-pulse-opacity', String(s.pulseOpacity));
    applyPulseOrigins(root, s.pulseOrigins);
    root.style.setProperty('--grid-glow-size', `${s.glowSize}px`);
    root.style.setProperty('--grid-glow-opacity', String(s.glowOpacity));
  };

  const updateGrid = (partial: Partial<{
    enabled: boolean; size: number; opacity: number;
    pulse: boolean; pulseSpeed: number; pulseOpacity: number; pulseOrigins: PulseOrigins;
    glow: boolean; glowSize: number; glowOpacity: number;
  }>) => {
    const s = {
      enabled: partial.enabled ?? gridEnabled,
      size: partial.size ?? gridSize,
      opacity: partial.opacity ?? gridOpacity,
      pulse: partial.pulse ?? gridPulseEnabled,
      pulseSpeed: partial.pulseSpeed ?? gridPulseSpeed,
      pulseOpacity: partial.pulseOpacity ?? gridPulseOpacity,
      pulseOrigins: partial.pulseOrigins ?? gridPulseOrigins,
      glow: partial.glow ?? gridGlowEnabled,
      glowSize: partial.glowSize ?? gridGlowSize,
      glowOpacity: partial.glowOpacity ?? gridGlowOpacity,
    };
    if (partial.enabled !== undefined) { setGridEnabled(s.enabled); localStorage.setItem('controlpoint-grid-enabled', s.enabled ? '1' : '0'); }
    if (partial.size !== undefined) { setGridSize(s.size); localStorage.setItem('controlpoint-grid-size', String(s.size)); }
    if (partial.opacity !== undefined) { setGridOpacity(s.opacity); localStorage.setItem('controlpoint-grid-opacity', String(s.opacity)); }
    if (partial.pulse !== undefined) { setGridPulseEnabled(s.pulse); localStorage.setItem('controlpoint-grid-pulse', s.pulse ? '1' : '0'); }
    if (partial.pulseSpeed !== undefined) { setGridPulseSpeed(s.pulseSpeed); localStorage.setItem('controlpoint-grid-pulse-speed', String(s.pulseSpeed)); }
    if (partial.pulseOpacity !== undefined) { setGridPulseOpacity(s.pulseOpacity); localStorage.setItem('controlpoint-grid-pulse-opacity', String(s.pulseOpacity)); }
    if (partial.pulseOrigins !== undefined) { setGridPulseOrigins(s.pulseOrigins); localStorage.setItem('controlpoint-grid-pulse-origins', writePulseOrigins(s.pulseOrigins)); }
    if (partial.glow !== undefined) { setGridGlowEnabled(s.glow); localStorage.setItem('controlpoint-grid-glow', s.glow ? '1' : '0'); }
    if (partial.glowSize !== undefined) { setGridGlowSize(s.glowSize); localStorage.setItem('controlpoint-grid-glow-size', String(s.glowSize)); }
    if (partial.glowOpacity !== undefined) { setGridGlowOpacity(s.glowOpacity); localStorage.setItem('controlpoint-grid-glow-opacity', String(s.glowOpacity)); }
    applyGridSettings(s);
  };

  const resetGrid = () => {
    updateGrid({
      enabled: true, size: 32, opacity: 0.12,
      pulse: true, pulseSpeed: 6, pulseOpacity: 0.22, pulseOrigins: { ...DEFAULT_PULSE_ORIGINS },
      glow: true, glowSize: 280, glowOpacity: 0.25,
    });
  };
  const [section, setSection] = useState<Section>('account');
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  // On phones the nav and content can't sit side-by-side — drill in instead.
  const [mobileNav, setMobileNav] = useState(true);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  // Seeded values for unsaved-changes tracking on the account form.
  const [initialName, setInitialName] = useState('');
  const [initialRole, setInitialRole] = useState('');
  // Inline save feedback (auto-clears after 4s).
  const [saveFeedback, setSaveFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);
  const [teamName, setTeamName] = useState('');
  const [ftcNumber, setFtcNumber] = useState('');
  const initialNumber = useRef('');
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
  // Bruno AI personal preferences (persisted to localStorage, see getBrunoPreferences in src/utils/brunoPrefs.ts)
  const readPref = (key: string, fallback: string) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const readBoolPref = (key: string, fallback: boolean) => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v === '1';
    } catch { return fallback; }
  };
  const [explanationStyle, setExplanationStyle] = useState(() => readPref('controlpoint-bruno-explanation-style', 'balanced'));
  const [responseFormat, setResponseFormat] = useState(() => readPref('controlpoint-bruno-response-format', 'detailed'));
  const [autoExplain, setAutoExplain] = useState(() => readBoolPref('controlpoint-bruno-auto-explain', true));
  const [confirmChanges, setConfirmChanges] = useState(() => readBoolPref('controlpoint-bruno-confirm-changes', true));
  const [rememberPrefs, setRememberPrefs] = useState(() => readBoolPref('controlpoint-bruno-remember-prefs', true));
  const [ftcPrefsOpen, setFtcPrefsOpen] = useState(false);
  const [ftcOpmodeStyle, setFtcOpmodeStyle] = useState(() => readPref('controlpoint-ftc-opmode-style', 'linear'));
  const [ftcIndent, setFtcIndent] = useState(() => readPref('controlpoint-ftc-indent', '4'));
  const [ftcComments, setFtcComments] = useState(() => readBoolPref('controlpoint-ftc-comments', true));
  const [ftcBeginnerComments, setFtcBeginnerComments] = useState(() => readBoolPref('controlpoint-ftc-beginner-comments', false));
  const [ftcWarnHardware, setFtcWarnHardware] = useState(() => readBoolPref('controlpoint-ftc-warn-hardware', true));
  const [ftcWarnReversed, setFtcWarnReversed] = useState(() => readBoolPref('controlpoint-ftc-warn-reversed', true));
  const [ftcWarnPower, setFtcWarnPower] = useState(() => readBoolPref('controlpoint-ftc-warn-power', true));
  const [ftcWarnBlocking, setFtcWarnBlocking] = useState(() => readBoolPref('controlpoint-ftc-warn-blocking', true));
  const setPref = (key: string, value: string) => {
    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
  };
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Unsaved-changes guard for the account form ---
  const accountDirty = name !== initialName || role !== initialRole;
  const nameError: string | null = !name.trim()
    ? "Name can't be empty."
    : name.trim().length > 60
      ? 'Name must be 60 characters or fewer.'
      : null;
  const confirmDiscard = (): Promise<boolean> => {
    if (!accountDirty) return Promise.resolve(true);
    return confirmDialog({
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Discard them?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      danger: true,
    });
  };
  const switchSection = (id: Section) => {
    void confirmDiscard().then((ok) => {
      if (ok) { setSection(id); setMobileNav(false); }
    });
  };
  const backToNav = () => {
    void confirmDiscard().then((ok) => { if (ok) setMobileNav(true); });
  };
  const requestClose = () => {
    void confirmDiscard().then((ok) => { if (ok) onClose(); });
  };

  // Seed the forms every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSection('account');
    setName(user?.name || '');
    setRole(user?.role || '');
    setInitialName(user?.name || '');
    setInitialRole(user?.role || '');
    setSaveFeedback(null);
    setTeachMode(user?.bruno_teach_mode === 1);
    // 'max' was removed — anyone who had it falls back to 'high'
    setOutputLevel(user?.bruno_output_level === 'max' ? 'high' : (user?.bruno_output_level || 'medium'));
    setTeamName(team?.name || '');
    // Older workspaces only have the display number; show it in the one field.
    const num = team?.ftc_team_number ? String(team.ftc_team_number) : /^\d+$/.test(String(team?.number ?? '').trim()) ? String(team.number).trim() : '';
    setFtcNumber(num);
    initialNumber.current = num;
    setCopied(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC closes, like Discord — guarded when the account form is dirty.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Overlays opened from Settings (e.g. the expanded preview) own their Escape.
      if (e.target instanceof Element && e.target.closest('[data-esc-owner]')) return;
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;

  const saveAccount = async () => {
    const trimmed = name.trim();
    // Inline error is shown under the field; the button is disabled while invalid.
    if (!trimmed || trimmed.length > 60) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, role: role.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        onUserSaved(data.user);
        // Saved values become the new baseline — the form is no longer dirty.
        setInitialName(data.user.name || '');
        setInitialRole(data.user.role || '');
        setSaveFeedback({ kind: 'success', msg: 'Profile saved.' });
        notify('Profile saved.', 'success');
      } else {
        const msg = data.error || 'Could not save.';
        setSaveFeedback({ kind: 'error', msg });
        notify(msg, 'error');
      }
    } catch {
      setSaveFeedback({ kind: 'error', msg: 'Could not save.' });
      notify('Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Inline save feedback auto-clears after 4s.
  useEffect(() => {
    if (!saveFeedback) return;
    const id = window.setTimeout(() => setSaveFeedback(null), 4000);
    return () => window.clearTimeout(id);
  }, [saveFeedback]);

  const saveTeam = async () => {
    if (!team?.id) return;
    setSaving(true);
    try {
      const body: any = { name: teamName.trim() };
      // One number: the FTC team number also becomes the workspace's display
      // number ("Team #4215" in pickers). Sent when the admin changed it, or
      // when a prefilled display number isn't linked as the FTC team yet;
      // renaming alone never touches an existing number.
      const v = ftcNumber.trim();
      if (v !== initialNumber.current || (v && !team?.ftc_team_number)) {
        body.ftc_team_number = ftcNumber.trim() === '' ? null : parseInt(ftcNumber.trim(), 10);
        body.number = ftcNumber.trim();
      }
      const res = await apiFetch(`/api/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      // Only the fields this save changed, so it can't undo a concurrent invite-code change.
      if (res.ok) {
        onTeamSaved({ id: team.id, ...body });
        initialNumber.current = ftcNumber.trim();
        notify('Team settings saved.', 'success');
      }
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

  // Regenerating invalidates the old invite code; asks once before doing it.
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const regenerateAccessCode = async () => {
    if (!confirmRegen) { setConfirmRegen(true); return; }
    setRegenerating(true);
    try {
      const res = await apiFetch('/api/teams/regenerate-code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_code) {
        onTeamSaved({ id: team?.id, access_code: data.access_code });
        notify('New invite code created. The old one no longer works.', 'success');
      } else notify(data.error || 'Could not create a new code.', 'error');
    } catch {
      notify('Could not create a new code.', 'error');
    } finally {
      setRegenerating(false);
      setConfirmRegen(false);
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
    { id: 'account', label: t('settings.myAccount'), icon: UserCircle, heading: t('settings.userSettings') },
    { id: 'appearance', label: t('settings.appearance'), icon: Palette, heading: t('settings.userSettings') },
    { id: 'voice', label: t('settings.voiceVideo'), icon: PhoneCall, heading: t('settings.userSettings') },
    { id: 'bruno', label: t('settings.brunoAI'), icon: Bot, heading: t('settings.userSettings') },
    ...(isAdmin
      ? [
          { id: 'team' as Section, label: t('settings.teamOverview'), icon: Users, heading: t('settings.teamSettings') },
          { id: 'roles' as Section, label: t('settings.roles'), icon: ShieldCheck, heading: t('settings.teamSettings') },
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
        {/* Mobile nav header with close button */}
        <div className="md:hidden flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          <h2 className="text-xl font-display font-bold text-text-base">{t('settings.title')}</h2>
          <button
            onClick={requestClose}
            aria-label="Close settings"
            className="p-2.5 rounded-full border border-text-base/10 text-text-muted hover:text-text-base hover:border-text-base/25 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
          {[t('settings.userSettings'), t('settings.teamSettings')].map((heading) => {
            const items = sections.filter((s) => s.heading === heading);
            if (!items.length) return null;
            return (
              <div key={heading} className="mb-6">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">{heading}</p>
                <div className="space-y-1">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => switchSection(s.id)}
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
        <div className="p-4 border-t border-text-base/[0.06] space-y-2">
          <button
            onClick={() => setWhatsNewOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.04] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            What's New in v{CURRENT_VERSION}
          </button>
          <p className="text-[11px] text-text-muted/60 text-center">Control Point v{CURRENT_VERSION}</p>
        </div>
      </div>

      {/* Content — full-screen drill-in on phones, pane on desktop */}
      <div className={cn('flex-1 flex-col min-w-0', mobileNav ? 'hidden md:flex' : 'flex')}>
        <div className="flex items-center justify-between px-4 sm:px-10 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={backToNav}
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
            onClick={requestClose}
            aria-label="Close settings"
            className="p-2.5 rounded-full border border-text-base/10 text-text-muted hover:text-text-base hover:border-text-base/25 hover:rotate-90 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 sm:px-10 pb-10">
          {/* Appearance gets the full width (controls + live preview side by side). */}
          <div className={cn('space-y-8', section === 'appearance' ? 'max-w-6xl' : 'max-w-xl')}>
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
                    <label htmlFor="settings-display-name" className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Display name</label>
                    <input
                      id="settings-display-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? 'settings-display-name-error' : undefined}
                      className={cn(inputClass, nameError && 'border-rose-500/60 focus:border-rose-500/60 focus:ring-rose-500/20')}
                    />
                    {nameError && (
                      <p id="settings-display-name-error" role="alert" className="text-xs text-rose-400 font-medium mt-1.5">
                        {nameError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="settings-role" className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Role / title</label>
                    <input id="settings-role" value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} placeholder="e.g. Build Captain" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="settings-email" className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Email</label>
                    <input id="settings-email" value={user?.email || ''} disabled className={cn(inputClass, 'opacity-50 cursor-not-allowed')} />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => void saveAccount()}
                      disabled={saving || !!nameError}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
                    >
                      {saving ? 'Saving…' : 'Save changes'}
                    </button>
                    {saveFeedback && (
                      <p
                        role="status"
                        className={cn(
                          'text-xs font-semibold flex items-center gap-1.5',
                          saveFeedback.kind === 'success' ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {saveFeedback.kind === 'success'
                          ? <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          : <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                        {saveFeedback.msg}
                      </p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-text-base mb-3">Password</h3>
                  {user?.hasPassword ? (
                    <PasswordChangeForm inputClass={inputClass} />
                  ) : (
                    <p className="text-xs text-text-muted">
                      You sign in with Google, so there's no password here to change — manage it in your Google account instead.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-bold text-text-base mb-3">{t('settings.language')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => {
                          if (i18n.language === lang.code) return;
                          // setLanguage persists + calls i18n.changeLanguage (async).
                          // Wait for it, then confirm in the NEW language.
                          setLanguage(lang.code);
                          void i18n.changeLanguage(lang.code).then(() => {
                            notify(i18n.t('settings.languageChanged', { language: lang.label }), 'success');
                          });
                        }}
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
                  <p className="text-[11px] text-text-muted mt-2">
                    {t('settings.languageAppliesInstantly')}
                  </p>
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

            {section === 'appearance' && (
              <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] xl:gap-10 xl:items-start">
              <section className="space-y-6 min-w-0">
                <div className="card-surface p-5 sm:p-6">
                  <InterfaceModePicker />
                </div>
                <div className="card-surface p-5 sm:p-6">
                  <ThemePicker />
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-text-base">Background Effects</h3>
                    <p className="text-xs text-text-muted leading-relaxed mt-1">
                      Customize the animated background grid. These effects belong to the Legacy experience.
                    </p>
                  </div>
                  <button
                    onClick={resetGrid}
                    className="text-xs text-accent hover:underline shrink-0 mt-0.5"
                  >
                    Reset to defaults
                  </button>
                </div>

                <div className="grid gap-4 2xl:grid-cols-2 2xl:items-start">
                {/* Grid on/off */}
                <div className="card-surface p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-text-base">Background grid</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Show the volt grid lines behind everything
                    </p>
                  </div>
                  <Switch
                    checked={gridEnabled}
                    onChange={(v) => updateGrid({ enabled: v })}
                    label="Background grid"
                  />
                </div>

                {gridEnabled && (
                  <>
                    {/* Grid size */}
                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Grid size</p>
                        <EditableSliderValue value={gridSize} min={16} max={64} step={2} unit="px"
                          label="Grid size" onChange={(v) => updateGrid({ size: Math.round(v) })} />
                      </div>
                      <input
                        type="range" min={16} max={64} step={2} value={gridSize}
                        onChange={(e) => updateGrid({ size: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Grid size"
                      />
                      <p className="text-xs text-text-muted mt-1">Spacing between grid lines</p>
                    </div>

                    {/* Grid brightness */}
                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Grid brightness</p>
                        <EditableSliderValue value={Math.round(gridOpacity * 100)} min={2} max={40} step={1} unit="%"
                          label="Grid brightness" onChange={(v) => updateGrid({ opacity: v / 100 })} />
                      </div>
                      <input
                        type="range" min={0.02} max={0.4} step={0.01} value={gridOpacity}
                        onChange={(e) => updateGrid({ opacity: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Grid brightness"
                      />
                      <p className="text-xs text-text-muted mt-1">How visible the grid lines are</p>
                    </div>
                  </>
                )}

                </div>

                {/* Pulse wave */}
                <div className="card-surface p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-text-base">Pulsing volt wave</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Animated yellow glow that travels across the background grid
                    </p>
                  </div>
                  <Switch
                    checked={gridPulseEnabled}
                    onChange={(v) => updateGrid({ pulse: v })}
                    label="Pulsing volt wave"
                  />
                </div>

                {gridPulseEnabled && (
                  <>
                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Pulse speed</p>
                        <EditableSliderValue value={gridPulseSpeed} min={2} max={15} step={0.5} unit="s"
                          label="Pulse speed" onChange={(v) => updateGrid({ pulseSpeed: v })} />
                      </div>
                      <input
                        type="range" min={2} max={15} step={0.5} value={gridPulseSpeed}
                        onChange={(e) => updateGrid({ pulseSpeed: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Pulse speed"
                      />
                      <p className="text-xs text-text-muted mt-1">How fast the wave travels</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Pulse intensity</p>
                        <EditableSliderValue value={Math.round(gridPulseOpacity * 100)} min={2} max={40} step={1} unit="%"
                          label="Pulse intensity" onChange={(v) => updateGrid({ pulseOpacity: v / 100 })} />
                      </div>
                      <input
                        type="range" min={0.02} max={0.4} step={0.01} value={gridPulseOpacity}
                        onChange={(e) => updateGrid({ pulseOpacity: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Pulse intensity"
                      />
                      <p className="text-xs text-text-muted mt-1">How bright the traveling glow is</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <p className="text-sm font-semibold text-text-base mb-2">Pulse from</p>
                      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pulse from">
                        {PULSE_ORIGIN_OPTIONS.map(({ key, label }) => {
                          const on = gridPulseOrigins[key];
                          // Keep at least one origin on — turning off the last
                          // would silently hide the pulse (use the switch above).
                          const lastOn = on && Object.values(gridPulseOrigins).filter(Boolean).length === 1;
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={on}
                              disabled={lastOn}
                              onClick={() => updateGrid({ pulseOrigins: { ...gridPulseOrigins, [key]: !on } })}
                              className={cn(
                                "px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:cursor-not-allowed",
                                on
                                  ? "bg-accent text-accent-ink border-accent"
                                  : "bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-accent/40 hover:text-text-base"
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-text-muted mt-1">Where the glow rises from — pick any mix</p>
                    </div>
                  </>
                )}

                </div>

                {/* Cursor glow */}
                <div className="card-surface p-5 space-y-4 2xl:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-text-base">Cursor glow</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      The grid ignites around your cursor as you move
                    </p>
                  </div>
                  <Switch
                    checked={gridGlowEnabled}
                    onChange={(v) => updateGrid({ glow: v })}
                    label="Cursor glow"
                  />
                </div>

                {gridGlowEnabled && (
                  <>
                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Glow size</p>
                        <EditableSliderValue value={gridGlowSize} min={120} max={500} step={10} unit="px"
                          label="Glow size" onChange={(v) => updateGrid({ glowSize: Math.round(v) })} />
                      </div>
                      <input
                        type="range" min={120} max={500} step={10} value={gridGlowSize}
                        onChange={(e) => updateGrid({ glowSize: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Glow size"
                      />
                      <p className="text-xs text-text-muted mt-1">How far the glow spreads from your cursor</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-text-base">Glow intensity</p>
                        <EditableSliderValue value={Math.round(gridGlowOpacity * 100)} min={5} max={60} step={1} unit="%"
                          label="Glow intensity" onChange={(v) => updateGrid({ glowOpacity: v / 100 })} />
                      </div>
                      <input
                        type="range" min={0.05} max={0.6} step={0.01} value={gridGlowOpacity}
                        onChange={(e) => updateGrid({ glowOpacity: Number(e.target.value) })}
                        className="w-full accent-[#FFC700]"
                        aria-label="Glow intensity"
                      />
                      <p className="text-xs text-text-muted mt-1">How bright the cursor glow is</p>
                    </div>
                  </>
                )}
                </div>
                </div>
              </section>
              {/* Sticky live preview beside the controls from xl up (at lg the
                  controls would be too narrow); below that the settings stack full-width. */}
              <div className="hidden xl:block sticky top-0">
                <DashboardPreview />
              </div>
              </div>
            )}

            {section === 'voice' && (
              <section className="space-y-6">
                <h3 className="text-sm font-bold text-text-base">Devices</h3>
                <DeviceSettingsSection />
                <div>
                  <h4 className="text-sm font-bold text-text-base mb-1">Camera</h4>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">
                    Camera only turns on when you explicitly ask — never automatically.
                  </p>
                  <CameraDefaultSetting />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-text-base mb-3">Sounds</h3>
                  <SoundToggle />
                </div>
              </section>
            )}

            {section === 'bruno' && (
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-text-base">Bruno AI</h3>
                  <p className="text-xs text-text-muted leading-relaxed mt-1">
                    Customize how Bruno helps you with FTC code and robotics. Saved to your account, so it follows you on every device.
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
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Output length">
                    {(['low', 'medium', 'high'] as const).map((lvl) => (
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

                {/* Explanation style */}
                <div>
                  <h4 className="text-sm font-bold text-text-base mb-1">Explanation style</h4>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">
                    How technical Bruno&apos;s explanations should be.
                  </p>
                  <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Explanation style">
                    {([
                      { value: 'beginner', label: 'Beginner-friendly' },
                      { value: 'balanced', label: 'Balanced' },
                      { value: 'technical', label: 'Technical' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={explanationStyle === opt.value}
                        onClick={() => { setExplanationStyle(opt.value); setPref('controlpoint-bruno-explanation-style', opt.value); }}
                        className={cn(
                          'rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                          explanationStyle === opt.value
                            ? 'bg-accent text-accent-ink border-accent'
                            : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Response format */}
                <div>
                  <h4 className="text-sm font-bold text-text-base mb-1">Response format</h4>
                  <p className="text-xs text-text-muted leading-relaxed mb-2">
                    How Bruno structures its answers by default.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Response format">
                    {([
                      { value: 'concise', label: 'Concise answers' },
                      { value: 'detailed', label: 'Detailed explanations' },
                      { value: 'step-by-step', label: 'Step-by-step tutorials' },
                      { value: 'code-first', label: 'Code-first responses' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={responseFormat === opt.value}
                        onClick={() => { setResponseFormat(opt.value); setPref('controlpoint-bruno-response-format', opt.value); }}
                        className={cn(
                          'rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                          responseFormat === opt.value
                            ? 'bg-accent text-accent-ink border-accent'
                            : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Behavior toggles */}
                <div className="space-y-2">
                  {([
                    { label: 'Auto-explain code', desc: 'Automatically explain unfamiliar code snippets.', value: autoExplain, set: setAutoExplain, key: 'controlpoint-bruno-auto-explain' },
                    { label: 'Confirm before changes', desc: 'Ask before making changes to tasks, notes, or robot code.', value: confirmChanges, set: setConfirmChanges, key: 'controlpoint-bruno-confirm-changes' },
                    { label: 'Remember preferences', desc: 'Bruno remembers your preferred explanation style and coding habits.', value: rememberPrefs, set: setRememberPrefs, key: 'controlpoint-bruno-remember-prefs' },
                  ] as const).map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                      <div>
                        <p className="text-sm font-semibold text-text-base">{row.label}</p>
                        <p className="text-xs text-text-muted mt-0.5">{row.desc}</p>
                      </div>
                      <Switch
                        checked={row.value}
                        onChange={(v) => { row.set(v); setPref(row.key, v ? '1' : '0'); }}
                        label={row.label}
                      />
                    </div>
                  ))}
                </div>

                {/* Chatbot Persona — team setting, admins only */}
                {isAdmin && navGptQualifies(team?.name) && (
                  <div>
                    <h4 className="text-sm font-bold text-text-base mb-1">Chatbot persona</h4>
                    <p className="text-xs text-text-muted leading-relaxed mb-2">
                      Who answers in the team chatbot.
                    </p>
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
                  </div>
                )}

                {/* FTC Coding Preferences */}
                <div className="rounded-2xl border border-text-base/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFtcPrefsOpen((v) => !v)}
                    aria-expanded={ftcPrefsOpen}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-text-base/[0.03] hover:bg-text-base/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <span className="text-left">
                      <span className="block text-sm font-bold text-text-base">FTC Coding Preferences</span>
                      <span className="block text-xs text-text-muted mt-0.5">OpMode style, code conventions, and safety checks for FTC Java.</span>
                    </span>
                    <ChevronDown className={cn('w-5 h-5 text-text-muted transition-transform', ftcPrefsOpen && 'rotate-180')} aria-hidden="true" />
                  </button>
                  {ftcPrefsOpen && (
                    <div className="p-4 space-y-4 border-t border-text-base/10">
                      {/* Programming language — read-only, team controlled */}
                      <div className="p-4 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                        <p className="text-sm font-semibold text-text-base">Programming language</p>
                        <p className="text-sm font-bold text-accent mt-1">Java</p>
                        <p className="text-[11px] text-text-muted mt-1">Managed by your team administrator.</p>
                      </div>

                      {/* OpMode style */}
                      <div>
                        <h4 className="text-sm font-bold text-text-base mb-1">Preferred OpMode style</h4>
                        {/* Labels wrap rather than clip on phones; <wbr> lets
                            "LinearOpMode" break as Linear / OpMode. */}
                        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Preferred OpMode style">
                          {([
                            { value: 'linear', label: <>Linear<wbr />OpMode</> },
                            { value: 'opmode', label: 'OpMode' },
                            { value: 'ask', label: 'Ask each time' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={ftcOpmodeStyle === opt.value}
                              onClick={() => { setFtcOpmodeStyle(opt.value); setPref('controlpoint-ftc-opmode-style', opt.value); }}
                              className={cn(
                                'min-w-0 rounded-xl border px-1.5 py-2.5 text-xs sm:text-[13px] leading-tight font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                                ftcOpmodeStyle === opt.value
                                  ? 'bg-accent text-accent-ink border-accent'
                                  : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Code conventions */}
                      <div>
                        <h4 className="text-sm font-bold text-text-base mb-2">Code conventions</h4>
                        <p className="text-xs text-text-muted mb-1.5">Indentation</p>
                        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Indentation">
                          {([
                            { value: '2', label: '2 spaces' },
                            { value: '4', label: '4 spaces' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={ftcIndent === opt.value}
                              onClick={() => { setFtcIndent(opt.value); setPref('controlpoint-ftc-indent', opt.value); }}
                              className={cn(
                                'rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                                ftcIndent === opt.value
                                  ? 'bg-accent text-accent-ink border-accent'
                                  : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-2 mt-2">
                          {([
                            { label: 'Include comments by default', value: ftcComments, set: setFtcComments, key: 'controlpoint-ftc-comments' },
                            { label: 'Beginner-friendly comments', value: ftcBeginnerComments, set: setFtcBeginnerComments, key: 'controlpoint-ftc-beginner-comments' },
                          ] as const).map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                              <p className="text-sm font-semibold text-text-base">{row.label}</p>
                              <Switch
                                checked={row.value}
                                onChange={(v) => { row.set(v); setPref(row.key, v ? '1' : '0'); }}
                                label={row.label}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Safety checks */}
                      <div>
                        <h4 className="text-sm font-bold text-text-base mb-2">Safety checks</h4>
                        <div className="space-y-2">
                          {([
                            { label: 'Warn about missing hardware mappings', value: ftcWarnHardware, set: setFtcWarnHardware, key: 'controlpoint-ftc-warn-hardware' },
                            { label: 'Warn about reversed motors', value: ftcWarnReversed, set: setFtcWarnReversed, key: 'controlpoint-ftc-warn-reversed' },
                            { label: 'Warn about unsafe motor powers', value: ftcWarnPower, set: setFtcWarnPower, key: 'controlpoint-ftc-warn-power' },
                            { label: 'Warn when code may block the main loop', value: ftcWarnBlocking, set: setFtcWarnBlocking, key: 'controlpoint-ftc-warn-blocking' },
                          ] as const).map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-4 p-3.5 rounded-2xl bg-text-base/[0.03] border border-text-base/[0.06]">
                              <p className="text-sm font-semibold text-text-base">{row.label}</p>
                              <Switch
                                checked={row.value}
                                onChange={(v) => { row.set(v); setPref(row.key, v ? '1' : '0'); }}
                                label={row.label}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
                  <div>
                    <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">FTC team number</label>
                    <input value={ftcNumber} onChange={(e) => setFtcNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="e.g. 33950" className={inputClass} />
                    <p className="text-[11px] text-text-muted mt-1.5">Used for Team Stats, Predict and your workspace's team number.</p>
                  </div>
                  <button
                    onClick={() => void saveTeam()}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </section>

                <WorkspaceInterfaceDefault team={team} onTeamSaved={onTeamSaved} />

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
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      onClick={() => void regenerateAccessCode()}
                      disabled={regenerating}
                      className={cn(
                        'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50',
                        confirmRegen ? 'bg-rose-500 text-white hover:brightness-110' : 'bg-text-base/[0.06] text-text-base hover:bg-text-base/[0.1]'
                      )}
                    >
                      <RefreshCw className={cn('w-4 h-4', regenerating && 'animate-spin')} />
                      {regenerating ? 'Generating…' : confirmRegen ? 'Yes, replace the code' : 'Generate new code'}
                    </button>
                    {confirmRegen && !regenerating && (
                      <>
                        <button onClick={() => setConfirmRegen(false)} className="px-3 py-2 rounded-xl text-sm font-bold text-text-muted hover:text-text-base">Cancel</button>
                        <span className="text-xs text-text-muted basis-full">The current code stops working. Existing members aren't affected.</span>
                      </>
                    )}
                  </div>
                </section>

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
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </div>
  );
}
