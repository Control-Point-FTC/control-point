/**
 * Scenarios covered:
 * 13. Refresh / browser-close persistence: PATCHes deep-merge over stored
 *     state, so a refresh never loses progress or invents completion.
 * 15. Team switching preserves onboarding: state is keyed by normalized
 *     account email, not by team membership — the same account maps to the
 *     same row after switching teams, and validation rejects junk.
 */
import { describe, it, expect } from 'vitest';
import {
  defaultOnboardingState,
  mergeOnboardingState,
  validateOnboardingPatch,
  normalizeOnboardingEmail,
  legacyOnboardingState,
} from '../../../../server/onboarding';

describe('scenario 13 — refresh persistence via deep merge', () => {
  it('a patch updates only the fields it names', () => {
    const stored = {
      ...defaultOnboardingState(),
      welcomeSeen: true,
      walkthrough: { completed: false, lastStep: 4 },
    };
    const merged = mergeOnboardingState(stored, { welcomeSeen: true });
    expect(merged.welcomeSeen).toBe(true);
    // untouched nested progress survives the refresh
    expect(merged.walkthrough.lastStep).toBe(4);
    expect(merged.steps.profile.status).toBe('pending');
  });

  it('marks steps without clobbering sibling steps', () => {
    const stored = {
      ...defaultOnboardingState(),
      steps: { profile: { status: 'done' as const }, tour: { status: 'pending' as const } },
    };
    const merged = mergeOnboardingState(stored, {
      steps: { tour: { status: 'skipped' as const } },
    });
    expect(merged.steps.profile.status).toBe('done');
    expect(merged.steps.tour.status).toBe('skipped');
  });

  it('corrupt stored rows degrade to defaults instead of crashing (server JSON-parses to null first)', () => {
    const merged = mergeOnboardingState(null, { welcomeSeen: true });
    expect(merged.welcomeSeen).toBe(true);
    expect(merged.steps.profile.status).toBe('pending');
  });

  it('walkthrough resume position survives a merge', () => {
    const merged = mergeOnboardingState(defaultOnboardingState(), {
      walkthrough: { lastStep: 7 },
    });
    expect(merged.walkthrough).toEqual({ completed: false, lastStep: 7 });
  });

  it('a full PATCH round-trips through JSON storage', () => {
    const patch = { welcomeSeen: true, dismissed: false, checklistDismissed: true };
    const v = validateOnboardingPatch({ state: patch });
    expect(v.ok).toBe(true);
    if (v.ok) {
      const merged = mergeOnboardingState(defaultOnboardingState(), v.patch);
      // server JSON-stringifies into the row, then JSON-parses on read
      const reloaded = mergeOnboardingState(JSON.parse(JSON.stringify(merged)), null);
      expect(reloaded).toEqual(merged);
    }
  });
});

describe('validateOnboardingPatch', () => {
  it('accepts a well-formed state object', () => {
    const v = validateOnboardingPatch({ state: { welcomeSeen: true } });
    expect(v.ok).toBe(true);
  });
  it('rejects non-object bodies and unknown step statuses', () => {
    expect(validateOnboardingPatch(null).ok).toBe(false);
    expect(validateOnboardingPatch({ state: { steps: { profile: { status: 'finished' } } } }).ok).toBe(false);
    expect(validateOnboardingPatch({ state: { walkthrough: { lastStep: -2 } } }).ok).toBe(false);
  });
  it('silently drops unknown keys instead of storing them', () => {
    const v = validateOnboardingPatch({ state: { welcomeSeen: true, admin: true } as any });
    expect(v.ok).toBe(true);
    if (v.ok) {
      // validation passes the patch through; the merge is what drops unknowns
      const merged = mergeOnboardingState(defaultOnboardingState(), v.patch);
      expect(merged).not.toHaveProperty('admin');
      expect(merged.welcomeSeen).toBe(true);
    }
  });
  it('rejects oversized payloads', () => {
    const big = { state: { welcomeSeen: 'x'.repeat(200_000) } };
    expect(validateOnboardingPatch(big).ok).toBe(false);
  });
});

describe('scenario 2 (legacy) — pre-feature accounts are never force-onboarded', () => {
  it('legacy state is seen + dismissed, with steps still individually addressable', () => {
    const s = legacyOnboardingState();
    expect(s.welcomeSeen).toBe(true);
    expect(s.dismissed).toBe(true);
    // a legacy user can still complete steps manually via Setup guide
    const resumed = mergeOnboardingState(s, { steps: { profile: { status: 'done' } } });
    expect(resumed.steps.profile.status).toBe('done');
    expect(resumed.dismissed).toBe(true);
  });
});

describe('scenario 15 — email-keyed state survives team switches', () => {
  it('normalizes the same account to the same key regardless of casing/whitespace', () => {
    expect(normalizeOnboardingEmail('User@Example.com')).toBe('user@example.com');
    expect(normalizeOnboardingEmail('  USER@example.com  ')).toBe('user@example.com');
  });
  it('returns null for unusable emails so callers 401 instead of writing junk rows', () => {
    expect(normalizeOnboardingEmail('')).toBeNull();
    expect(normalizeOnboardingEmail('not-an-email')).toBeNull();
    expect(normalizeOnboardingEmail(null)).toBeNull();
  });
  it('merge is membership-agnostic: no team fields exist or are honored', () => {
    const merged = mergeOnboardingState(defaultOnboardingState(), {
      team_id: 999,
      welcomeSeen: true,
    } as any);
    expect(merged).not.toHaveProperty('team_id');
    expect(merged.welcomeSeen).toBe(true);
  });
});
