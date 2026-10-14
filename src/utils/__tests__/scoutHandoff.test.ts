import { afterEach, describe, expect, it } from 'vitest';
import { rememberScoutHandoff, takeScoutHandoff } from '../scoutHandoff';
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
});
