import { describe, it, expect, beforeEach, vi } from "vitest";
import { currentWeather, placeMatches, resetWeatherCache, unitFor, weatherSummary } from "../weather";

const geo = {
  results: [
    { name: "Paramus", admin1: "Ohio", country: "United States", country_code: "US", latitude: 40, longitude: -80 },
    { name: "Paramus", admin1: "New Jersey", country: "United States", country_code: "US", latitude: 40.94, longitude: -74.07 },
  ],
};
const wx = { current: { temperature_2m: 22.2, weather_code: 2 } };

describe("weather widget data", () => {
  beforeEach(() => resetWeatherCache());

  it("maps WMO codes and picks units by country", () => {
    expect(weatherSummary(0)).toBe("Clear");
    expect(weatherSummary(63)).toBe("Rain");
    expect(weatherSummary(96)).toBe("Thunderstorms");
    expect(unitFor("USA")).toBe("F");
    expect(unitFor("Canada")).toBe("C");
  });

  it("geocodes the right town (state + country) and reports °F for US teams", async () => {
    const fetchJson = vi.fn(async (url: string) => (url.includes("geocoding") ? geo : wx));
    const w = await currentWeather({ city: "Paramus", state: "NJ", country: "USA" }, fetchJson, 1_000);
    expect(w).toMatchObject({ tempC: 22, tempF: 72, summary: "Partly cloudy", unit: "F", place: "Paramus, New Jersey" });
    expect(fetchJson.mock.calls[1][0]).toContain("latitude=40.94");
  });

  it("caches: geocode for a week, the reading for 15 minutes", async () => {
    const fetchJson = vi.fn(async (url: string) => (url.includes("geocoding") ? geo : wx));
    const place = { city: "Paramus", state: "NJ", country: "USA" };
    await currentWeather(place, fetchJson, 0);
    await currentWeather(place, fetchJson, 10 * 60_000);
    expect(fetchJson).toHaveBeenCalledTimes(2);
    await currentWeather(place, fetchJson, 16 * 60_000);
    expect(fetchJson).toHaveBeenCalledTimes(3); // reading refreshed, geocode reused
  });

  it("no town, or nothing found: no widget", async () => {
    const fetchJson = vi.fn(async () => ({ results: [] }));
    expect(await currentWeather({ city: "" }, fetchJson)).toBeNull();
    expect(await currentWeather({ city: "Nowhere" }, fetchJson)).toBeNull();
  });

  it("matches state abbreviations to full names, and never falls back to a namesake elsewhere", async () => {
    expect(placeMatches({ admin1: "New Jersey", country_code: "US" }, { state: "NJ", country: "USA" })).toBe(true);
    expect(placeMatches({ admin1: "Ohio", country_code: "US" }, { state: "NJ", country: "USA" })).toBe(false);
    const onlyOhio = vi.fn(async (url: string) => (url.includes("geocoding") ? { results: [geo.results[0]] } : wx));
    expect(await currentWeather({ city: "Paramus", state: "NJ", country: "USA" }, onlyOhio)).toBeNull();
  });

  it("a burst of requests shares one fetch per key", async () => {
    let calls = 0;
    const slow = vi.fn(async (url: string) => { calls++; await new Promise((r) => setTimeout(r, 20)); return url.includes("geocoding") ? geo : wx; });
    const place = { city: "Paramus", state: "NJ", country: "USA" };
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => currentWeather(place, slow, 1)));
    expect(all.every((w) => w?.tempF === 72)).toBe(true);
    expect(calls).toBe(2); // one geocode + one reading
  });

  it("a missing reading is no reading (not 0°)", async () => {
    const empty = vi.fn(async (url: string) => (url.includes("geocoding") ? geo : { current: { temperature_2m: null, weather_code: null } }));
    expect(await currentWeather({ city: "Paramus", state: "NJ", country: "USA" }, empty)).toBeNull();
  });
});
