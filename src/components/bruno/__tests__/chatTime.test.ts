import { describe, expect, it } from 'vitest';
import { chatTimeAgo } from '../chatTime';

describe('chat times', () => {
  const now = Date.parse('2026-10-17T23:00:00Z');
  it('reads the server UTC format without a zone as UTC, never "in 3 hours"', () => {
    expect(chatTimeAgo('2026-10-17 20:00:00', now)).toBe('3h');
    expect(chatTimeAgo('2026-10-17T22:55:00.000Z', now)).toBe('5m');
    expect(chatTimeAgo('2026-10-15 23:00:00', now)).toBe('2d');
    expect(chatTimeAgo('', now)).toBe('');
  });
});
