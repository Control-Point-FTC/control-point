/**
 * Current weather for the team's town (owner spec: a small "72° · Sunny"
 * widget). Open-Meteo (free, no key): the town comes from the team's FTC
 * record, is geocoded once a week, and the reading is cached 15 minutes per
 * place so the whole app makes at most a few calls an hour.
 */

export interface Place { city?: string | null; state?: string | null; country?: string | null }
export interface WeatherNow { tempF: number; tempC: number; code: number; summary: string; unit: "F" | "C"; place: string; at: number }

const GEO_TTL = 7 * 24 * 3600_000;
const WX_TTL = 15 * 60_000;
const geoCache = new Map<string, { at: number; lat: number; lon: number; name: string } | { at: number; missing: true }>();
const wxCache = new Map<string, { at: number; data: Omit<WeatherNow, "unit" | "place"> }>();

/** WMO weather code → a short word or two. */
export function weatherSummary(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "—";
}

/** Fahrenheit where people use it (US and a few others), Celsius elsewhere. */
export function unitFor(country?: string | null): "F" | "C" {
  const c = String(country || "").trim().toUpperCase();
  return ["USA", "US", "UNITED STATES", "LIBERIA", "BAHAMAS", "BELIZE", "CAYMAN ISLANDS", "PALAU"].includes(c) ? "F" : "C";
}

type Fetcher = (url: string) => Promise<any>;

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function currentWeather(place: Place, fetchJson: Fetcher = getJson, now = Date.now()): Promise<WeatherNow | null> {
  const city = String(place.city || "").trim();
  if (!city) return null;
  const key = `${city}|${place.state || ""}|${place.country || ""}`.toLowerCase();
  let geo = geoCache.get(key);
  if (!geo || now - geo.at > GEO_TTL) {
    const r = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=${encodeURIComponent(city)}`);
    const list: any[] = Array.isArray(r?.results) ? r.results : [];
    // Prefer the match in the right state/region and country.
    const st = String(place.state || "").toLowerCase();
    const co = String(place.country || "").toLowerCase();
    const pick = list.find((x) => (!st || String(x.admin1 || "").toLowerCase() === st || String(x.admin1_code || "").toLowerCase() === st)
      && (!co || String(x.country || "").toLowerCase().includes(co) || String(x.country_code || "").toLowerCase() === co || (co === "usa" && x.country_code === "US")))
      || list[0];
    geo = pick ? { at: now, lat: Number(pick.latitude), lon: Number(pick.longitude), name: [pick.name, pick.admin1].filter(Boolean).join(", ") } : { at: now, missing: true };
    geoCache.set(key, geo);
  }
  if ("missing" in geo) return null;
  const wxKey = `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`;
  let wx = wxCache.get(wxKey);
  if (!wx || now - wx.at > WX_TTL) {
    const r = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code&temperature_unit=celsius`);
    const c = Number(r?.current?.temperature_2m);
    const code = Number(r?.current?.weather_code);
    if (!Number.isFinite(c) || !Number.isFinite(code)) return null;
    wx = { at: now, data: { tempC: Math.round(c), tempF: Math.round(c * 9 / 5 + 32), code, summary: weatherSummary(code), at: now } };
    wxCache.set(wxKey, wx);
  }
  return { ...wx.data, unit: unitFor(place.country), place: geo.name };
}

/** Test hook. */
export function resetWeatherCache() { geoCache.clear(); wxCache.clear(); }
