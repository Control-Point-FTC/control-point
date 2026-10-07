import { describe, it, expect } from 'vitest';
import { formatWeather } from '../chrome/ClockWeather';

describe('top-bar weather text', () => {
  it('is the small "72° · Sunny" form in the team’s unit, or nothing', () => {
    expect(formatWeather({ available: true, tempF: 72, tempC: 22, unit: 'F', summary: 'Clear' })).toBe('72° · Clear');
    expect(formatWeather({ available: true, tempF: 72, tempC: 22, unit: 'C', summary: 'Rain' })).toBe('22° · Rain');
    expect(formatWeather({ available: false })).toBeNull();
    expect(formatWeather(null)).toBeNull();
  });
});
