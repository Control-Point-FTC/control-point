import { afterEach, describe, expect, it } from 'vitest';
import { rememberScoutHandoff, scoutHandoffPending, takeScoutHandoff } from '../scoutHandoff';
import { controlScoutEventUrl, controlScoutTeamUrl } from '../controlScout';
afterEach(() => sessionStorage.clear());

describe('Control Scout hand-off across sign-in', () => {
  it('returns to the hand-off start once after sign-in', () => {
    expect(rememberScoutHandoff('?scout_state=abcDEF0123456789_-xyz')).toBe(true);
    expect(takeScoutHandoff()).toBe('/api/auth/scout/start?state=abcDEF0123456789_-xyz');
    expect(takeScoutHandoff()).toBeNull();
  });
  it('never keeps a malformed state', () => {
    for (const s of ['?scout_state=short', '?scout_state=' + 'a'.repeat(129), '?scout_state=abcdefghijklmnop%2F%2Fevil', '?other=1', ''])
      { expect(rememberScoutHandoff(s), s).toBe(false); expect(takeScoutHandoff(), s).toBeNull(); }
    sessionStorage.setItem('pendingScoutHandoff', 'https://evil.example/x');
    expect(takeScoutHandoff()).toBeNull();
  });
  it('can tell a hand-off is pending without using it up (the sign-in page says so)', () => {
    expect(scoutHandoffPending()).toBe(false);
    rememberScoutHandoff('?scout_state=abcDEF0123456789_-xyz');
    expect(scoutHandoffPending()).toBe(true);
    expect(scoutHandoffPending()).toBe(true); // still there
    expect(takeScoutHandoff()).not.toBeNull();
    expect(scoutHandoffPending()).toBe(false);
    sessionStorage.setItem('pendingScoutHandoff', 'https://evil.example/x');
    expect(scoutHandoffPending()).toBe(false); // only a valid state counts
  });
});

describe('Control Scout links', () => {
  it('point at the same team or event on controlscout.org (event codes upper-case, as Scout canonicalises them)', () => {
    expect(controlScoutTeamUrl(4215, 2025)).toBe('https://controlscout.org/teams/4215?season=2025');
    expect(controlScoutEventUrl('usnjnom3', 2025)).toBe('https://controlscout.org/events/2025/USNJNOM3');
  });
});
