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

// One save queue for the whole app, not per mounted section: leaving and
// reopening Notifications can't let an older queued save land after a newer
// one, and a reopened section reads the prefs only after pending saves settle.
// Each request is aborted after REQUEST_MS, so a stalled one can't hold the
// queue (and a reopened section's loading state) forever.
export const REQUEST_MS = 15_000;
let saveQueue: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(job: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const start = () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_MS);
    return job(ctrl.signal).finally(() => clearTimeout(timer));
  };
  const run = saveQueue.then(start, start);
  saveQueue = run.catch(() => undefined);
  return run;
};

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [failed, setFailed] = useState(false);
  // Saves run one at a time, in order, so the server's answers arrive in the
  // order they were made and the last one is always the truth. A failure
  // goes back to the last values the server confirmed.
  const confirmed = useRef<Prefs | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    let live = true;
    void enqueue(async (signal) => {
      try {
        const res = await apiFetch('/api/notification-prefs', { signal });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (live) { confirmed.current = data; setPrefs(data); }
      } catch {
        if (live) setFailed(true);
      }
    });
    return () => { live = false; };
  }, []);

  const save = (patch: Partial<Prefs>) => {
    if (!prefs) return;
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    pending.current++;
    void enqueue(async (signal) => {
      try {
        const res = await apiFetch('/api/notification-prefs', {
          signal,
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not save — try again.');
        confirmed.current = data;
      } catch (e: any) {
        notify(e?.name === 'AbortError' ? 'Saving took too long — try again.' : e?.message || 'Could not save — try again.', 'error');
        // Undo this change on screen; later queued changes re-apply below.
        if (confirmed.current) setPrefs(confirmed.current);
      } finally {
        // Once nothing else is queued, show exactly what the server holds.
        if (--pending.current === 0 && confirmed.current) setPrefs(confirmed.current);
      }
    });
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
