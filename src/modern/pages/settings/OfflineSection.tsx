// Settings → Offline data (V3.5 phase 6b): download the team's FTC region (or
// every region) so team search, team pages and events work with no
// connection. The region is detected from the events the team played.
import { useEffect, useState } from 'react';
import { CloudDownload, HardDrive, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui-kit';
import { confirmDialog, notify } from '../../../components/dialog';
import { relTime } from '../../../components/scout/ScoutUi';
import { downloadOfflinePack, fetchOfflineRegions, getOfflinePack, onOfflinePackChange, removeOfflinePack, type SavedPack } from '../../../services/offlinePack';
import { packAsOf, packStale } from '../../../utils/offlinePack';
import type { OfflineRegion, OfflineRegions } from '../../../types/offlinePack';
import { SettingsGroup, SettingsRow } from './SettingsPage';

/** "USNJ" → "NJ" for the button; other codes use the region's name. */
export const shortRegion = (r: Pick<OfflineRegion, 'code' | 'name'>) => (/^US[A-Z]{2}$/.test(r.code) ? r.code.slice(2) : r.name);
const size = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
const count = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

export function OfflineSection() {
  const [saved, setSaved] = useState<SavedPack | null>(null);
  const [regions, setRegions] = useState<OfflineRegions | null>(null);
  const [regionsError, setRegionsError] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getOfflinePack().then((p) => { if (live) setSaved(p); });
    const off = onOfflinePackChange((p) => { if (live) setSaved(p); });
    return () => { live = false; off(); };
  }, []);

  // The region list: again on Retry, and when the connection comes back.
  const [regionsTry, setRegionsTry] = useState(0);
  useEffect(() => {
    let live = true;
    setRegionsError(null);
    fetchOfflineRegions()
      .then((r) => { if (live) setRegions(r); })
      .catch((e) => { if (live) setRegionsError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Connect to the internet to download offline data.' : (e as Error).message); });
    return () => { live = false; };
  }, [regionsTry]);
  useEffect(() => {
    const back = () => setRegionsTry((n) => n + 1);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);

  const download = async (code: string, label: string) => {
    // One region per device: say so before replacing a different one.
    if (saved && saved.pack.region !== code) {
      const ok = await confirmDialog({
        title: `Replace ${saved.pack.regionName}?`,
        message: `This device keeps one download at a time. ${label} will replace your ${saved.pack.regionName} offline data.`,
        confirmLabel: `Download ${label}`,
      });
      if (!ok) return;
    }
    setBusy(code);
    try {
      const p = await downloadOfflinePack(code);
      notify(`${label} offline data saved (${size(p.bytes)}).`, 'success');
    } catch (e) {
      notify((e as Error).message || 'Download failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try { await removeOfflinePack(); notify('Offline data removed from this device.', 'success'); }
    catch (e) { notify((e as Error).message || 'Could not remove it.', 'error'); }
    finally { setBusy(null); }
  };

  const detected = regions?.detected ?? null;
  const pickable = (regions?.regions ?? []).filter((r) => r.code !== detected?.code);
  const chosen = pickable.find((r) => r.code === other) ?? null;
  const stale = saved ? packStale(saved.pack) : false;

  return (
    <>
      <SettingsGroup title="On this device" description="Team search, team pages and events fall back to this copy when there's no connection.">
        {saved ? (
          <>
            <SettingsRow
              label={`${saved.pack.regionName} · ${saved.pack.season}–${String((saved.pack.season + 1) % 100).padStart(2, '0')} season`}
              description={`${count(saved.pack.teams.length, 'team')} · ${count(saved.pack.events.length, 'event')} · ${size(saved.bytes)} · data from ${relTime(packAsOf(saved.pack))}`}
            >
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!!busy || !regions} onClick={() => void download(saved.pack.region, saved.pack.regionName)} className="max-sm:h-11">
                  <RefreshCw className={busy === saved.pack.region ? 'animate-spin motion-reduce:animate-none' : undefined} /> Update
                </Button>
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void remove()} className="max-sm:h-11">
                  <Trash2 /> Remove
                </Button>
              </div>
            </SettingsRow>
            {stale && (
              <p role="status" className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-warning">
                <TriangleAlert className="size-4 shrink-0" aria-hidden /> This copy is over a week old — update it while you're online so results and odds are current.
              </p>
            )}
          </>
        ) : (
          <SettingsRow label="Nothing downloaded" description="Download your region below before heading somewhere without Wi-Fi.">
            <HardDrive className="size-5 text-muted-foreground" aria-hidden />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="Download" description={regions ? `FTC teams, events and match results for the ${regions.season}–${String((regions.season + 1) % 100).padStart(2, '0')} season.` : undefined}>
        {regionsError && !regions && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <p role="alert" className="text-sm text-muted-foreground">{regionsError}</p>
            <Button variant="outline" size="sm" onClick={() => setRegionsTry((n) => n + 1)} className="max-sm:h-11"><RefreshCw /> Try again</Button>
          </div>
        )}
        {!regions && !regionsError && <p className="px-4 py-4 text-sm text-muted-foreground">Loading regions…</p>}
        {regions && (
          <>
            {detected ? (
              <SettingsRow label={`Your region: ${detected.name}`} description={`${count(detected.teams, 'team')} · ${count(detected.events, 'event')}`}>
                <Button disabled={!!busy} onClick={() => void download(detected.code, detected.name)} className="max-sm:h-11 max-sm:w-full">
                  <CloudDownload /> {busy === detected.code ? 'Downloading…' : `Download ${shortRegion(detected)} offline data`}
                </Button>
              </SettingsRow>
            ) : (
              <SettingsRow label="Your region" description="We couldn't tell your region yet (connect your FTC team number in Settings, or pick one below)." />
            )}
            <SettingsRow label="Another region" description={chosen ? `${count(chosen.teams, 'team')} · ${count(chosen.events, 'event')}` : 'For an out-of-region event or championship.'}>
              <div className="flex flex-wrap gap-2">
                <Select value={other} onValueChange={setOther}>
                  <SelectTrigger className="w-56 max-sm:h-11" aria-label="Region"><SelectValue placeholder="Choose a region" /></SelectTrigger>
                  <SelectContent>
                    {pickable.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={!chosen || !!busy} onClick={() => chosen && void download(chosen.code, chosen.name)} className="max-sm:h-11">
                  <CloudDownload /> {chosen && busy === chosen.code ? 'Downloading…' : 'Download'}
                </Button>
              </div>
            </SettingsRow>
            <SettingsRow label="Everything" description={`Every region: ${count(regions.all.teams, 'team')} · ${count(regions.all.events, 'event')}. Larger, but covers championships with teams from anywhere.`}>
              <Button variant="outline" disabled={!!busy} onClick={() => void download('ALL', 'All regions')} className="max-sm:h-11 max-sm:w-full">
                <CloudDownload /> {busy === 'ALL' ? 'Downloading…' : 'Download all regions'}
              </Button>
            </SettingsRow>
          </>
        )}
      </SettingsGroup>
    </>
  );
}
