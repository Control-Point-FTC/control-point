// Modern calls policy (phase 10d) for Settings → Admin, over the shared
// useVoiceSettings (same GET / PUT /api/voice/settings and clamping as the
// Classic card). Rows use the Settings page's own row layout and kit
// controls; Save appears in a sticky bar only when something changed.
import { AnimatePresence, motion } from 'motion/react';
import { Info, Loader2, PhoneCall } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Switch } from '../../../components/ui-kit';
import { QUALITY_OPTIONS, useVoiceSettings } from '../../../components/voice/useVoiceSettings';
import { SettingsRow } from './SettingsPage';

const TOGGLES = [
  { key: 'video_enabled', label: 'Video calls', description: 'Allow cameras in voice channels and calls.' },
  { key: 'screenshare_enabled', label: 'Screen sharing', description: 'Allow participants to share their screen.' },
  { key: 'global_spotlight_enabled', label: 'Global spotlight', description: 'Let moderators spotlight one speaker for everyone.' },
  { key: 'dm_calls_allowed', label: 'Member calls', description: 'Members can start open calls from the member list (anyone on the team can join).' },
  { key: 'group_calls_allowed', label: 'Group invitations', description: 'Invite several members at once when starting an open call.' },
];
const NUMBERS = [
  { key: 'default_max_participants', label: 'Default max participants', description: 'Cap for new voice channels (0 = unlimited).', min: 0, max: 100, fallback: 0 },
  { key: 'call_timeout_minutes', label: 'Call timeout (minutes)', description: 'End inactive calls after this long (0 = never).', min: 0, max: 480, fallback: 0 },
  { key: 'reconnect_attempts', label: 'Reconnect attempts', description: 'Retries for a dropped connection before giving up.', min: 0, max: 20, fallback: 5 },
];
const QUALITIES = [
  { key: 'default_video_quality', label: 'Default video quality', description: 'Capture quality for new channels.' },
  { key: 'default_audio_quality', label: 'Default audio quality', description: 'Voice bitrate: low 24 kbps · medium 64 kbps · high 128 kbps.' },
];

export function CallsPolicy() {
  const v = useVoiceSettings();
  if (v.loading) return <div className="grid gap-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!v.s) return <p className="p-4 text-sm text-muted-foreground">Could not load the calls policy.</p>;
  return (
    <div>
      {TOGGLES.map((t) => (
        <SettingsRow key={t.key} label={t.label} description={t.description} htmlFor={`vs-${t.key}`}>
          <Switch id={`vs-${t.key}`} checked={!!v.s[t.key]} onCheckedChange={(c) => v.set({ [t.key]: c })} />
        </SettingsRow>
      ))}
      {QUALITIES.map((q) => (
        <SettingsRow key={q.key} label={q.label} description={q.description} htmlFor={`vs-${q.key}`}>
          <Select value={v.s[q.key] || 'medium'} onValueChange={(val) => v.set({ [q.key]: val })}>
            <SelectTrigger id={`vs-${q.key}`} className="w-36 max-sm:h-11"><SelectValue /></SelectTrigger>
            <SelectContent>{QUALITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
      ))}
      {NUMBERS.map((n) => (
        <SettingsRow key={n.key} label={n.label} description={n.description} htmlFor={`vs-${n.key}`}>
          <Input id={`vs-${n.key}`} type="number" inputMode="numeric" min={n.min} max={n.max} value={v.s[n.key] ?? n.fallback} onChange={(e) => v.set({ [n.key]: e.target.value })} className="w-24 text-center tabular-nums max-sm:h-11" />
        </SettingsRow>
      ))}
      <div className="flex items-start gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>Who can moderate calls (mute, deafen, remove, spotlight) is set by role permissions: <Link to="/settings?section=roles" replace className="font-medium text-foreground underline-offset-4 hover:underline">manage it in Roles</Link> with <code className="rounded bg-muted px-1 text-xs">moderate_calls</code> and <code className="rounded bg-muted px-1 text-xs">manage_voice</code>.</p>
      </div>
      <AnimatePresence>
        {(v.dirty || v.saving) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-xl border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
            {v.dirty && !v.saving && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
            <Button onClick={() => void v.save()} disabled={v.saving || !v.dirty}>
              {v.saving ? <><Loader2 className="animate-spin" /> Saving…</> : <><PhoneCall /> Save calls policy</>}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
