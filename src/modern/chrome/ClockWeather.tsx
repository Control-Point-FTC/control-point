// Top-bar clock and a small weather reading for the team's town
// ("3:42 PM · 72° · Sunny"). Weather comes from /api/weather (Open-Meteo,
// cached 15 minutes on the server) and is simply hidden when there's none.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';

interface Weather { available: boolean; tempF?: number; tempC?: number; unit?: 'F' | 'C'; summary?: string; place?: string }

const REFRESH_MS = 15 * 60_000;

export function formatWeather(w: Weather | null): string | null {
  if (!w?.available || w.tempF == null || w.tempC == null) return null;
  const t = w.unit === 'C' ? w.tempC : w.tempF;
  return `${t}° · ${w.summary || ''}`.replace(/ · $/, '');
}

export function ClockWeather() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    // Tick on the minute boundary, then every minute.
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => apiFetch('/api/weather')
      .then((r) => (r.ok ? r.json() : null))
      .then((w) => { if (live) setWeather(w); })
      .catch(() => { /* offline: keep the last reading */ });
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => { live = false; window.clearInterval(id); };
  }, []);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const wx = formatWeather(weather);
  return (
    <span
      className="hidden items-center gap-1.5 whitespace-nowrap px-1 text-xs tabular-nums text-text-muted sm:inline-flex"
      title={weather?.place ? `Weather in ${weather.place}` : undefined}
      aria-label={wx ? `${time}, ${wx}${weather?.place ? ` in ${weather.place}` : ''}` : time}
    >
      <time dateTime={now.toISOString()}>{time}</time>
      {wx && <><span aria-hidden="true">·</span><span>{wx}</span></>}
    </span>
  );
}
