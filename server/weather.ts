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

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  DC: "district of columbia", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota",
  MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
  NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon",
  PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah",
  VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming", PR: "puerto rico",
};
const COUNTRY_CODES: Record<string, string> = { usa: "us", "united states": "us", us: "us", canada: "ca", mexico: "mx", "united kingdom": "gb", uk: "gb" };
const norm = (v: unknown) => String(v || "").trim().toLowerCase();

/** Does a geocoding result sit in the team's state/region and country? */
export function placeMatches(result: any, place: Place): boolean {
  const st = norm(place.state);
  if (st) {
    const full = US_STATES[st.toUpperCase()] || st;
    const r1 = norm(result.admin1);
    const r1code = norm(result.admin1_code);
    if (r1 !== full && r1 !== st && r1code !== st) return false;
  }
  const co = norm(place.country);
  if (co) {
    const code = COUNTRY_CODES[co] || (co.length === 2 ? co : "");
    if (norm(result.country_code) !== code && norm(result.country) !== co) return false;
  }
  return true;
}

// One request per key at a time: a burst of members opening the app shares it.
const pending = new Map<string, Promise<any>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const p = pending.get(key);
  if (p) return p as Promise<T>;
  const q = run().finally(() => pending.delete(key));
  pending.set(key, q);
  return q;
}

export async function currentWeather(place: Place, fetchJson: Fetcher = getJson, now = Date.now()): Promise<WeatherNow | null> {
  const city = String(place.city || "").trim();
  if (!city) return null;
  const key = `${city}|${place.state || ""}|${place.country || ""}`.toLowerCase();
  let geo = geoCache.get(key);
  if (!geo || now - geo.at > GEO_TTL) {
    geo = await once(`geo:${key}`, async () => {
      const r = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=${encodeURIComponent(city)}`);
      const list: any[] = Array.isArray(r?.results) ? r.results : [];
      // Only a town in the team's own state and country — never a namesake elsewhere.
      const pick = list.find((x) => placeMatches(x, place));
      const g = pick
        ? { at: now, lat: Number(pick.latitude), lon: Number(pick.longitude), name: [pick.name, pick.admin1].filter(Boolean).join(", ") }
        : { at: now, missing: true as const };
      geoCache.set(key, g);
      return g;
    });
  }
  if (!geo || "missing" in geo) return null;
  const g = geo;
  const wxKey = `${g.lat.toFixed(2)},${g.lon.toFixed(2)}`;
  let wx = wxCache.get(wxKey);
  if (!wx || now - wx.at > WX_TTL) {
    wx = await once(`wx:${wxKey}`, async () => {
      const r = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,weather_code&temperature_unit=celsius`);
      const c = r?.current?.temperature_2m;
      const code = r?.current?.weather_code;
      // A missing reading is no reading (not 0°, not "clear").
      if (typeof c !== "number" || typeof code !== "number" || !Number.isFinite(c) || !Number.isFinite(code)) return undefined;
      const entry = { at: now, data: { tempC: Math.round(c), tempF: Math.round(c * 9 / 5 + 32), code, summary: weatherSummary(code), at: now } };
      wxCache.set(wxKey, entry);
      return entry;
    });
    if (!wx) return null;
  }
  return { ...wx.data, unit: unitFor(place.country), place: g.name };
}

/** Test hook. */
export function resetWeatherCache() { geoCache.clear(); wxCache.clear(); pending.clear(); }
