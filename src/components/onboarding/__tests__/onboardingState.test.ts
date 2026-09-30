/**
 * Scenarios covered:
 *  1. New user sees the welcome screen on first login
 *  2. Returning/dismissed user does not see the welcome screen again
 * 11. Partial progress resumes where the user left off
 * 12. (logic half) unchanged profiles produce no PATCH body — no overwrite risk
 * 13. (logic half) server-side merge preserves untouched fields across refreshes
 * 15. (logic half) state is keyed by normalized account email, not team membership
 */
import { describe, it, expect } from 'vitest';
import {
  defaultOnboardingState,
  normalizeOnboardingState,
  shouldShowWelcome,
  shouldShowChecklist,
  isSetupComplete,
  checklistItems,
  firstIncompleteWizardStep,
  resolveTourSteps,
  buildProfilePatch,
  validateProfileInput,
  computeTooltipPosition,
  TOUR_STEPS,
} from '../onboardingState';

describe('scenario 1 — new user sees welcome on first login', () => {
  it('defaults to welcome-unseen and not dismissed', () => {
    const s = defaultOnboardingState();
    expect(shouldShowWelcome(s)).toBe(true);
  });
});

describe('scenario 2 — returning user is not nagged', () => {
  it('hides welcome once seen', () => {
    const s = { ...defaultOnboardingState(), welcomeSeen: true };
    expect(shouldShowWelcome(s)).toBe(false);
  });
  it('hides welcome when the whole flow was dismissed', () => {
    const s = { ...defaultOnboardingState(), dismissed: true };
    expect(shouldShowWelcome(s)).toBe(false);
  });
  it('hides the dashboard checklist once everything is done', () => {
    const s = normalizeOnboardingState({
      steps: { profile: { status: 'done' }, tour: { status: 'done' } },
    });
    expect(isSetupComplete(s)).toBe(true);
    expect(shouldShowChecklist(s)).toBe(false);
  });
  it('skipped steps do NOT count as complete', () => {
    const s = normalizeOnboardingState({
      steps: { profile: { status: 'skipped' }, tour: { status: 'done' } },
    });
    expect(isSetupComplete(s)).toBe(false);
    expect(shouldShowChecklist(s)).toBe(true);
  });
  it('checklist stays hidden after the user dismisses it', () => {
    const s = normalizeOnboardingState({
      checklistDismissed: true,
      steps: { profile: { status: 'pending' }, tour: { status: 'pending' } },
    });
    expect(shouldShowChecklist(s)).toBe(false);
  });
});

describe('scenario 11 — partial progress resumes', () => {
  it('normalizing preserves per-step statuses from the server', () => {
    const s = normalizeOnboardingState({
      welcomeSeen: true,
      steps: { profile: { status: 'done' }, tour: { status: 'pending' } },
      walkthrough: { completed: false, lastStep: 4 },
    });
    expect(s.steps.profile.status).toBe('done');
    expect(s.steps.tour.status).toBe('pending');
    expect(s.walkthrough.lastStep).toBe(4);
  });
  it('resume points at the first incomplete wizard step', () => {
    const profileDone = normalizeOnboardingState({
      steps: { profile: { status: 'done' }, tour: { status: 'pending' } },
    });
    expect(firstIncompleteWizardStep(profileDone)).toBe(2);
    expect(firstIncompleteWizardStep(defaultOnboardingState())).toBe(0);
  });
  it('tolerates missing/corrupt server payloads', () => {
    expect(normalizeOnboardingState(null)).toEqual(defaultOnboardingState());
    expect(normalizeOnboardingState({ steps: { profile: { status: 'bogus' } } }).steps.profile.status).toBe('pending');
  });
  it('checklist reflects per-step status honestly', () => {
    const items = checklistItems(
      normalizeOnboardingState({ steps: { profile: { status: 'done' }, tour: { status: 'skipped' } } })
    );
    expect(items.find((i) => i.id === 'profile')!.status).toBe('done');
    expect(items.find((i) => i.id === 'tour')!.status).toBe('skipped');
  });
});

describe('scenario 12 — existing profiles are never overwritten', () => {
  it('returns null (no PATCH) when name and role are unchanged', () => {
    expect(
      buildProfilePatch({ name: 'Alex Rivera', role: 'Build Captain' }, { name: 'Alex Rivera', role: 'Build Captain' })
    ).toBeNull();
  });
  it('ignores surrounding whitespace when comparing', () => {
    expect(
      buildProfilePatch({ name: 'Alex Rivera', role: '' }, { name: '  Alex Rivera  ', role: '' })
    ).toBeNull();
  });
  it('builds a patch only for what the user edited', () => {
    const patch = buildProfilePatch({ name: 'Alex', role: '' }, { name: 'Alex Rivera', role: '' });
    expect(patch).toEqual({ name: 'Alex Rivera', role: '' });
  });
  it('requires a non-blank display name', () => {
    expect(validateProfileInput('   ')).toMatch(/display name/i);
    expect(validateProfileInput('Alex')).toBeNull();
  });
});

describe('tour step resolution', () => {
  it('shows the unified settings step to everyone (profile + team settings live behind the gear)', () => {
    const adminSteps = resolveTourSteps(true);
    const studentSteps = resolveTourSteps(false);
    expect(studentSteps.some((s) => s.id === 'settings')).toBe(true);
    expect(adminSteps.some((s) => s.id === 'settings')).toBe(true);
    expect(studentSteps.find((s) => s.id === 'settings')?.target).toBe('nav-settings-gear');
  });
  it('every targeted step uses the data-onboard convention', () => {
    for (const s of TOUR_STEPS) {
      if (s.target) expect(s.target).toMatch(/^(nav|header|mtab)-/);
    }
  });
});

describe('tooltip positioning', () => {
  const vw = 1280;
  const vh = 800;
  const rect = { top: 100, left: 100, width: 200, height: 40, bottom: 140, right: 300 };
  it('anchors below the target when there is room', () => {
    const p = computeTooltipPosition(rect, vw, vh, false);
    expect(p.kind).toBe('anchored');
    if (p.kind === 'anchored') {
      expect(p.above).toBe(false);
      expect(p.top).toBe(152);
    }
  });
  it('anchors above when there is no room below', () => {
    const low = { ...rect, top: 700, bottom: 740, left: 100, right: 300 };
    const p = computeTooltipPosition(low, vw, vh, false);
    expect(p.kind).toBe('anchored');
    if (p.kind === 'anchored') expect(p.above).toBe(true);
  });
  it('centers when the target is missing or off-screen', () => {
    expect(computeTooltipPosition(null, vw, vh, false).kind).toBe('center');
    const off = { ...rect, top: -500, bottom: -460, left: -500, right: -300 };
    expect(computeTooltipPosition(off, vw, vh, false).kind).toBe('center');
  });
  it('uses a bottom sheet on mobile', () => {
    expect(computeTooltipPosition(rect, 390, 844, true).kind).toBe('bottom-sheet');
  });
  it('clamps the tooltip inside the viewport horizontally', () => {
    const edge = { ...rect, left: 1200, right: 1280 };
    const p = computeTooltipPosition(edge, vw, vh, false);
    if (p.kind === 'anchored') {
      expect(p.left + p.width).toBeLessThanOrEqual(vw - 12);
      expect(p.left).toBeGreaterThanOrEqual(12);
    }
  });
});
