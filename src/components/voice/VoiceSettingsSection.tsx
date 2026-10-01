// VoiceSettingsSection — the "Voice & Calls" card for Settings.
// Exposes every team_voice_settings field via GET/PUT /api/voice/settings
// (server-validated, manage_voice only). The parent gates this on
// hasPerm('manage_voice'); the PUT stays server-validated regardless.
// Who can moderate calls is managed in the Roles page — this card only
// links there, it doesn't duplicate role/scope management.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, PhoneCall } from 'lucide-react';
import { cn } from '../ui';
import { voiceApi } from '../../voice';
import { notify } from '../dialog';

const inputCls =
  'w-full bg-secondary border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base focus:outline-none focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent';

function Row({ label, desc, control }: { label: string; desc: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-base">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full disabled:opacity-40"
    >
      <span aria-hidden="true" className={cn('relative block w-10 h-6 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-text-base/15')}>
        <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function VoiceSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    voiceApi
      .getSettings()
      .then((settings) => setS(settings))
      .catch(() => setS(null))
      .finally(() => setLoading(false));
  }, []);

  const set = (patch: Record<string, any>) => {
    setS((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const body = {
        video_enabled: !!s.video_enabled,
        screenshare_enabled: !!s.screenshare_enabled,
        global_spotlight_enabled: !!s.global_spotlight_enabled,
        dm_calls_allowed: !!s.dm_calls_allowed,
        group_calls_allowed: !!s.group_calls_allowed,
        default_max_participants: Math.max(0, Math.min(100, parseInt(s.default_max_participants, 10) || 0)),
        default_video_quality: s.default_video_quality,
        default_audio_quality: s.default_audio_quality,
        call_timeout_minutes: Math.max(0, Math.min(480, parseInt(s.call_timeout_minutes, 10) || 0)),
        reconnect_attempts: Math.max(0, Math.min(20, parseInt(s.reconnect_attempts, 10) || 5)),
      };
      const updated = await voiceApi.putSettings(body);
      setS(updated);
      setDirty(false);
      notify('Voice settings saved.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Could not save voice settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-text-muted">Loading voice settings…</p>;
  if (!s) return <p className="text-sm text-text-muted">Could not load voice settings.</p>;

  return (
    <div className="space-y-2">
      <div className="divide-y divide-text-base/[0.06]">
        <Row
          label="Video calls"
          desc="Allow cameras in voice channels and calls"
          control={<Toggle label="Video calls" checked={!!s.video_enabled} onChange={(v) => set({ video_enabled: v })} />}
        />
        <Row
          label="Screen sharing"
          desc="Allow participants to share their screen"
          control={<Toggle label="Screen sharing" checked={!!s.screenshare_enabled} onChange={(v) => set({ screenshare_enabled: v })} />}
        />
        <Row
          label="Global spotlight"
          desc="Let moderators spotlight one speaker for everyone"
          control={<Toggle label="Global spotlight" checked={!!s.global_spotlight_enabled} onChange={(v) => set({ global_spotlight_enabled: v })} />}
        />
        <Row
          label="Member calls"
          desc="Allow members to start open calls from the member list (anyone on the team can join)"
          control={<Toggle label="Member calls" checked={!!s.dm_calls_allowed} onChange={(v) => set({ dm_calls_allowed: v })} />}
        />
        <Row
          label="Group invitations"
          desc="Allow inviting several members at once when starting an open call"
          control={<Toggle label="Group invitations" checked={!!s.group_calls_allowed} onChange={(v) => set({ group_calls_allowed: v })} />}
        />
        <Row
          label="Default max participants"
          desc="Participant cap for new voice channels (0 = unlimited)"
          control={
            <input
              type="number"
              min={0}
              max={100}
              value={s.default_max_participants ?? 0}
              onChange={(e) => set({ default_max_participants: e.target.value })}
              aria-label="Default max participants"
              className={cn(inputCls, 'w-24 text-center')}
            />
          }
        />
        <Row
          label="Default video quality"
          desc="Capture quality for new channels"
          control={
            <select
              value={s.default_video_quality || 'medium'}
              onChange={(e) => set({ default_video_quality: e.target.value })}
              aria-label="Default video quality"
              className={cn(inputCls, 'w-32')}
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
        <Row
          label="Default audio quality"
          desc="Opus bitrate for voice: low 24 kbps · medium 64 kbps · high 128 kbps"
          control={
            <select
              value={s.default_audio_quality || 'medium'}
              onChange={(e) => set({ default_audio_quality: e.target.value })}
              aria-label="Default audio quality"
              className={cn(inputCls, 'w-32')}
            >
              {QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
        <Row
          label="Call timeout"
          desc="End inactive calls after this many minutes (0 = never)"
          control={
            <input
              type="number"
              min={0}
              max={480}
              value={s.call_timeout_minutes ?? 0}
              onChange={(e) => set({ call_timeout_minutes: e.target.value })}
              aria-label="Call timeout minutes"
              className={cn(inputCls, 'w-24 text-center')}
            />
          }
        />
        <Row
          label="Reconnect attempts"
          desc="How many times to retry a dropped connection before giving up"
          control={
            <input
              type="number"
              min={0}
              max={20}
              value={s.reconnect_attempts ?? 5}
              onChange={(e) => set({ reconnect_attempts: e.target.value })}
              aria-label="Reconnect attempts"
              className={cn(inputCls, 'w-24 text-center')}
            />
          }
        />
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-text-base/[0.04] border border-text-base/10 px-3 py-2.5">
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-text-muted">
          Who can moderate calls (mute, deafen, remove, spotlight) is controlled by role permissions —{' '}
          <Link to="/roles" className="text-accent font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
            manage it in Roles
          </Link>{' '}
          via the <code className="text-text-base/80">moderate_calls</code> and <code className="text-text-base/80">manage_voice</code> permissions.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {dirty && !saving && <span className="text-xs text-amber-300">Unsaved changes</span>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <PhoneCall className="w-4 h-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save voice settings'}
        </button>
      </div>
    </div>
  );
}

export default VoiceSettingsSection;
