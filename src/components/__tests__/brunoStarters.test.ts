import { describe, it, expect } from 'vitest';
import { starterPoolForPath, nextStarters } from '../brunoStarters';

describe('Bruno starters are page-specific', () => {
  it('Predict gets Predict prompts, not generic build questions', () => {
    const pool = starterPoolForPath('/predict/4215');
    expect(pool.prompts.join(' ')).toMatch(/prediction|odds|forecast/i);
    expect(pool.prompts).not.toContain('Mecanum vs tank drive — which should we pick?');
  });
  it('every main page has its own pool; CAD sub-pages share CAD', () => {
    const dash = starterPoolForPath('/dashboard');
    for (const p of ['/tasks', '/calendar', '/comm', '/outreach', '/attendance', '/inventory', '/stats', '/code', '/predict', '/budget', '/cad', '/chat', '/resources', '/teams', '/inbox']) {
      expect(starterPoolForPath(p), p).not.toBe(dash);
    }
    expect(starterPoolForPath('/cad-parts')).toBe(starterPoolForPath('/cad'));
    expect(starterPoolForPath('/somewhere-else')).toBe(dash);
  });
  it('rotates without repeats', () => {
    const pool = starterPoolForPath('/predict');
    const a = nextStarters(pool, []);
    const b = nextStarters(pool, a.seen);
    expect(a.batch.some((x) => b.batch.includes(x))).toBe(false);
  });
});
