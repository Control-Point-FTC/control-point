// Settings → Notifications (audit item 26): how team updates reach you —
// right away, bundled into a digest every few hours, or not at all — and
// whether @everyone / @here pings notify you. Mentions by name, task
// assignments and changes to your own roles always arrive.
import { useEffect, useRef, useState } from 'react';
import { Skeleton, Switch, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { SettingsGroup, SettingsRow } from './SettingsPage';

type Mode = 'instant' | 'digest' | 'off';
interface Prefs { team_updates: Mode; everyone_pings: boolean }

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [failed, setFailed] = useState(false);
  // Only the newest save settles what's shown; a failure goes back to the
  // last values the server confirmed (never to another unsaved change).
  const seq = useRef(0);
  const confirmed = useRef<Prefs | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await apiFetch('/api/notification-prefs');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (live) { confirmed.current = data; setPrefs(data); }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, []);

  const save = async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const mine = ++seq.current;
    setPrefs({ ...prefs, ...patch });
    try {
      const res = await apiFetch('/api/notification-prefs', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save — try again.');
      confirmed.current = data;
      if (mine === seq.current) setPrefs(data);
    } catch (e: any) {
      if (mine === seq.current && confirmed.current) setPrefs(confirmed.current);
      notify(e?.message || 'Could not save — try again.', 'error');
    }
  };

  if (failed) return <p className="text-sm text-muted-foreground">Notification settings couldn’t load. Check your connection and reopen this page.</p>;
  if (!prefs) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <div>
      <SettingsGroup title="Team updates" description="New budget entries, outreach events and calendar events from teammates.">
        <SettingsRow label="How they reach you" description={
          prefs.team_updates === 'instant' ? 'One notification per update, as it happens.'
            : prefs.team_updates === 'digest' ? 'Bundled into one summary every few hours.'
              : 'No notifications for team updates. They still show on their pages.'
        }>
          <ToggleGroup type="single" aria-label="Team updates" value={prefs.team_updates} onValueChange={(v) => { if (v) void save({ team_updates: v as Mode }); }}>
            <ToggleGroupItem value="instant">Instant</ToggleGroupItem>
            <ToggleGroupItem value="digest">Digest</ToggleGroupItem>
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Chat">
        <SettingsRow label="@everyone and @here" description="Notify me when someone pings the whole team or channel." htmlFor="notify-everyone">
          <Switch id="notify-everyone" checked={prefs.everyone_pings} onCheckedChange={(v) => void save({ everyone_pings: v })} />
        </SettingsRow>
      </SettingsGroup>
      <p className="text-sm text-muted-foreground">
        Mentions by name, tasks assigned to you and changes to your own roles always reach you.
      </p>
    </div>
  );
}
