// The pit display (/pit/<token>): a full-screen, no-login page for a spare
// screen in the pit or the shop. Big clock, this week's events (what's on now
// highlighted), the next match at a live event, the check-in QR while a
// session runs, and the latest #announcements. Refreshes every minute, keeps
// the screen awake where the browser allows, and reloads itself twice a day
// so it picks up new versions of the app.
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, Megaphone, QrCode, Swords, TriangleAlert } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { typeMeta } from '../calendar/CalendarSheets';

type PitMatch = { label: string; time: string | null; alliance: 'red' | 'blue'; partners: number[]; opponents: number[]; result?: { us: number; them: number; outcome: 'W' | 'L' | 'T' } };
export type PitData = {
  team: { name: string; number: number | null };
  timeZone: string;
  today: string;
  events: { id: number; title: string; date: string; start_time: string | null; end_time: string | null; location: string | null; event_type: string }[];
  announcements: { text: string; by: string; at: string }[];
  checkin: { url: string; code: string; expiresAt: string } | null;
  match: { event: string; next: PitMatch | null; last: PitMatch | null } | null;
};

const REFRESH_MS = 60_000;
const RELOAD_MS = 12 * 60 * 60_000;

/** "HH:MM" wall clock in a timezone, plus a display string. */
function clockIn(timeZone: string, now: Date) {
  const safe = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone }); return timeZone; } catch { return undefined; } })();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: safe, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return {
    hm: `${hh === '24' ? '00' : hh}:${mm}`,
    time: now.toLocaleTimeString(undefined, { timeZone: safe, hour: 'numeric', minute: '2-digit' }),
    date: now.toLocaleDateString(undefined, { timeZone: safe, weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

function wall(t: string | null): string {
  if (!t) return 'All day';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const d = new Date(`${date}T12:00:00Z`);
  const t = new Date(`${today}T12:00:00Z`);
  if (Math.round((d.getTime() - t.getTime()) / 86_400_000) === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "HH:MM" an hour later (capped at 23:59). */
function plusHour(t: string): string {
  const h = Number(t.slice(0, 2));
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}${t.slice(2)}`;
}

/**
 * Whether an event is going on right now (team wall clock, "HH:MM" strings).
 * One with no end, or an end before its start, counts as an hour long.
 */
export function isOnNow(e: { date: string; start_time: string | null; end_time: string | null }, today: string, hm: string): boolean {
  if (e.date !== today || !e.start_time) return false;
  const end = e.end_time && e.end_time > e.start_time ? e.end_time : plusHour(e.start_time);
  return e.start_time <= hm && hm < end;
}

export function PitDisplayPage({ token }: { token: string }) {
  const [data, setData] = useState<PitData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    const load = () => fetch(`/api/pit/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) { setData(body); setError(null); setStale(false); }
        else if (r.status === 404) { setData(null); setError(body?.error || 'This display link was turned off.'); }
        else setStale(true);
      })
      .catch(() => { if (live) setStale(true); });
    void load();
    const refresh = window.setInterval(() => void load(), REFRESH_MS);
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    const reload = window.setTimeout(() => window.location.reload(), RELOAD_MS);
    return () => { live = false; window.clearInterval(refresh); window.clearInterval(tick); window.clearTimeout(reload); };
  }, [token]);

  // Keep the screen awake while the page is visible (where the browser allows it).
  useEffect(() => {
    let lock: any = null;
    const take = () => { (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l; }).catch(() => {}); };
    take();
    const onVis = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch?.(() => {}); };
  }, []);

  useEffect(() => { document.title = data ? `${data.team.name} · Pit display` : 'Pit display · Control Point'; }, [data]);

  const clock = useMemo(() => clockIn(data?.timeZone || 'UTC', now), [data?.timeZone, now]);

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
        <TriangleAlert className="size-12 text-warning" aria-hidden />
        <h1 className="text-3xl font-semibold">Pit display unavailable</h1>
        <p className="max-w-xl text-xl text-muted-foreground">{error}</p>
      </main>
    );
  }
  if (!data) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-2xl text-muted-foreground">Loading the pit display…</main>;
  }

  const byDay = new Map<string, PitData['events']>();
  for (const e of data.events) byDay.set(e.date, [...(byDay.get(e.date) || []), e]);
  const side = data.match || data.checkin || data.announcements.length;

  return (
    <main className="min-h-dvh bg-background p-6 text-foreground lg:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">{data.team.name}{data.team.number ? <span className="text-muted-foreground"> #{data.team.number}</span> : null}</h1>
          <p className="mt-1 text-xl text-muted-foreground">{clock.date}</p>
        </div>
        <div className="flex items-center gap-4">
          {stale && <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-warning">Reconnecting…</span>}
          <p className="text-5xl font-semibold tabular-nums lg:text-7xl" aria-label={`Time ${clock.time}`}>{clock.time}</p>
          {document.fullscreenEnabled && (
            <Button variant="ghost" size="icon" aria-label="Full screen" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize2 /></Button>
          )}
        </div>
      </header>

      <div className={cn('grid gap-8', side && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        <section aria-label="This week">
          {data.events.length === 0 ? (
            <p className="text-2xl text-muted-foreground">Nothing on the calendar this week.</p>
          ) : (
            <div className="space-y-6">
              {[...byDay.entries()].map(([date, list]) => (
                <div key={date}>
                  <h2 className={cn('mb-3 text-lg font-semibold uppercase tracking-wide', date === data.today ? 'text-accent' : 'text-muted-foreground')}>{dayLabel(date, data.today)}</h2>
                  <ul className="space-y-3">
                    {list.map((e) => {
                      const now = isOnNow(e, data.today, clock.hm);
                      return (
                        <li key={e.id} className={cn('flex items-center gap-5 rounded-2xl border border-border border-l-8 bg-card px-5 py-4', typeMeta(e.event_type).bar, now && 'ring-2 ring-accent')}>
                          <span className="w-36 shrink-0 text-2xl font-medium tabular-nums">{wall(e.start_time)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-2xl font-semibold">{e.title}</span>
                            {(e.location || e.end_time) && <span className="block truncate text-lg text-muted-foreground">{[e.end_time && `until ${wall(e.end_time)}`, e.location].filter(Boolean).join(' · ')}</span>}
                          </span>
                          {now && <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-base font-semibold text-accent-ink">Now</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {side ? (
          <aside className="space-y-6">
            {data.match && <MatchCard match={data.match} />}
            {data.checkin && (
              <section aria-label="Check in" className="flex items-center gap-6 rounded-2xl border border-border bg-card p-5">
                <div className="rounded-xl bg-white p-3"><QRCodeSVG value={data.checkin.url} size={168} /></div>
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-semibold"><QrCode className="size-6 text-accent" aria-hidden /> Check in</h2>
                  <p className="mt-1 text-lg text-muted-foreground">Scan with your phone, or enter the code</p>
                  <p className="mt-2 font-mono text-4xl font-semibold tracking-widest">{data.checkin.code}</p>
                </div>
              </section>
            )}
            {data.announcements.length > 0 && (
              <section aria-label="Announcements" className="rounded-2xl border border-border bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-2xl font-semibold"><Megaphone className="size-6 text-accent" aria-hidden /> Announcements</h2>
                <ul className="space-y-4">
                  {data.announcements.map((a, i) => (
                    <li key={i}>
                      <p className="text-xl leading-snug">{a.text}</p>
                      <p className="mt-1 text-base text-muted-foreground">{a.by}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        ) : null}
      </div>
    </main>
  );
}

function Teams({ list }: { list: number[] }) {
  return <>{list.length ? list.join(', ') : '—'}</>;
}

function MatchCard({ match }: { match: NonNullable<PitData['match']> }) {
  const { next, last } = match;
  return (
    <section aria-label="Next match" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold"><Swords className="size-6 text-accent" aria-hidden /> {next ? 'Next match' : 'Matches'}</h2>
      <p className="mb-4 text-lg text-muted-foreground">{match.event}</p>
      {next ? (
        <div className={cn('rounded-xl border-l-8 bg-muted/40 p-4', next.alliance === 'red' ? 'border-l-red-500' : 'border-l-blue-500')}>
          <p className="text-4xl font-semibold">{next.label}{next.time ? <span className="ml-3 text-2xl font-medium text-muted-foreground">{new Date(next.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span> : null}</p>
          <p className="mt-2 text-xl"><span className={cn('font-semibold', next.alliance === 'red' ? 'text-red-500' : 'text-blue-500')}>{next.alliance === 'red' ? 'Red' : 'Blue'} alliance</span>{next.partners.length ? <> with <Teams list={next.partners} /></> : null}</p>
          <p className="text-lg text-muted-foreground">Against <Teams list={next.opponents} /></p>
        </div>
      ) : (
        <p className="text-xl text-muted-foreground">No more matches scheduled for us yet.</p>
      )}
      {last?.result && (
        <p className="mt-4 text-lg">
          Last: {last.label}{' '}
          <span className={cn('font-semibold', last.result.outcome === 'W' ? 'text-success' : last.result.outcome === 'L' ? 'text-destructive' : 'text-muted-foreground')}>
            {last.result.outcome === 'W' ? 'Won' : last.result.outcome === 'L' ? 'Lost' : 'Tied'} {last.result.us}–{last.result.them}
          </span>
        </p>
      )}
    </section>
  );
}
