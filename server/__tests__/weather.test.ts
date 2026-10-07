import { describe, it, expect, beforeEach, vi } from "vitest";
import { currentWeather, resetWeatherCache, unitFor, weatherSummary } from "../weather";

const geo = {
  results: [
    { name: "Paramus", admin1: "Ohio", country: "United States", country_code: "US", latitude: 40, longitude: -80 },
    { name: "Paramus", admin1: "New Jersey", admin1_code: "NJ", country: "United States", country_code: "US", latitude: 40.94, longitude: -74.07 },
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
});
