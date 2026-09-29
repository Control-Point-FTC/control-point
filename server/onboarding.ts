// Onboarding state persistence for Control Point.
//
// Stores per-account (email-keyed) onboarding progress: welcome screen seen,
// walkthrough progress, and setup-wizard step states. Keyed by the account's
// normalized email (from the session) rather than a single membership row, so
// progress survives team switches for multi-team accounts.
//
// The table is additive only (CREATE TABLE IF NOT EXISTS) — no destructive
// changes. All helpers here are pure and unit-testable without booting the
// server.

export const ONBOARDING_DDL = `CREATE TABLE IF NOT EXISTS onboarding_state (
  email TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`;

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export interface OnboardingStepState {
  status: OnboardingStepStatus;
  updatedAt?: string;
}

export interface OnboardingState {
  version: 1;
  /** The welcome screen has been shown (and Get Started / Skip chosen). */
  welcomeSeen: boolean;
  /** The user skipped the entire onboarding flow from the welcome screen. */
  dismissed: boolean;
  /** The dashboard "Complete your setup" card was dismissed. */
  checklistDismissed: boolean;
  walkthrough: {
    completed: boolean;
    /** Last viewed step index, so a tour can be resumed. */
    lastStep: number;
  };
  steps: {
    profile: OnboardingStepState;
    tour: OnboardingStepState;
  };
}

export function defaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    welcomeSeen: false,
    dismissed: false,
    checklistDismissed: false,
    walkthrough: { completed: false, lastStep: 0 },
    steps: {
      profile: { status: 'pending' },
      tour: { status: 'pending' },
    },
  };
}

const STEP_KEYS = ['profile', 'tour'] as const;

function isStepStatus(v: unknown): v is OnboardingStepStatus {
  return v === 'pending' || v === 'done' || v === 'skipped';
}

function sanitizeStep(v: unknown, fallback: OnboardingStepState): OnboardingStepState {
  if (!v || typeof v !== 'object') return fallback;
  const o = v as Record<string, unknown>;
  return {
    status: isStepStatus(o.status) ? o.status : fallback.status,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : fallback.updatedAt,
  };
}

/**
 * Merge a client-supplied patch over the stored state. Unknown keys are
 * dropped; malformed values fall back to the stored/default value. Never
 * throws on hostile input.
 */
export function mergeOnboardingState(
  stored: OnboardingState | null | undefined,
  patch: unknown
): OnboardingState {
  const base = stored && typeof stored === 'object' ? stored : defaultOnboardingState();
  const out = defaultOnboardingState();
  // Preserve known-good stored values first.
  out.welcomeSeen = base.welcomeSeen === true;
  out.dismissed = base.dismissed === true;
  out.checklistDismissed = base.checklistDismissed === true;
  out.walkthrough = {
    completed: base.walkthrough?.completed === true,
    lastStep:
      typeof base.walkthrough?.lastStep === 'number' && base.walkthrough.lastStep >= 0
        ? Math.floor(base.walkthrough.lastStep)
        : 0,
  };
  for (const k of STEP_KEYS) {
    out.steps[k] = sanitizeStep((base.steps as any)?.[k], out.steps[k]);
  }
  // Then apply the patch (same sanitization).
  if (patch && typeof patch === 'object') {
    const p = patch as Record<string, unknown>;
    if (typeof p.welcomeSeen === 'boolean') out.welcomeSeen = p.welcomeSeen;
    if (typeof p.dismissed === 'boolean') out.dismissed = p.dismissed;
    if (typeof p.checklistDismissed === 'boolean') out.checklistDismissed = p.checklistDismissed;
    if (p.walkthrough && typeof p.walkthrough === 'object') {
      const w = p.walkthrough as Record<string, unknown>;
      if (typeof w.completed === 'boolean') out.walkthrough.completed = w.completed;
      if (typeof w.lastStep === 'number' && w.lastStep >= 0)
        out.walkthrough.lastStep = Math.floor(w.lastStep);
    }
    if (p.steps && typeof p.steps === 'object') {
      const s = p.steps as Record<string, unknown>;
      for (const k of STEP_KEYS) {
        if (s[k] !== undefined) out.steps[k] = sanitizeStep(s[k], out.steps[k]);
      }
    }
  }
  return out;
}

/**
 * Validate the request body for PUT /api/onboarding. Returns the patch to
 * merge, or an error message. The state is always scoped to the caller's own
 * email — the client is never allowed to specify whose state to write.
 * Strict about shapes (so clients get useful errors); mergeOnboardingState
 * stays lenient for reading older stored rows.
 */
export function validateOnboardingPatch(body: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Missing request body' };
  }
  let raw = '';
  try {
    raw = JSON.stringify(body);
  } catch {
    return { ok: false, error: 'Invalid request body' };
  }
  if (raw.length > 200_000) {
    return { ok: false, error: 'Payload too large' };
  }
  const state = (body as Record<string, unknown>).state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { ok: false, error: 'Missing state object' };
  }
  const s = state as Record<string, unknown>;
  for (const k of ['welcomeSeen', 'dismissed', 'checklistDismissed'] as const) {
    if (s[k] !== undefined && typeof s[k] !== 'boolean') {
      return { ok: false, error: `Invalid ${k}: expected a boolean` };
    }
  }
  if (s.walkthrough !== undefined) {
    const w = s.walkthrough as Record<string, unknown>;
    if (!w || typeof w !== 'object' || Array.isArray(w)) {
      return { ok: false, error: 'Invalid walkthrough: expected an object' };
    }
    if (w.completed !== undefined && typeof w.completed !== 'boolean') {
      return { ok: false, error: 'Invalid walkthrough.completed: expected a boolean' };
    }
    if (
      w.lastStep !== undefined &&
      (typeof w.lastStep !== 'number' || !Number.isFinite(w.lastStep) || w.lastStep < 0)
    ) {
      return { ok: false, error: 'Invalid walkthrough.lastStep: expected a non-negative number' };
    }
  }
  if (s.steps !== undefined) {
    const steps = s.steps as Record<string, unknown>;
    if (!steps || typeof steps !== 'object' || Array.isArray(steps)) {
      return { ok: false, error: 'Invalid steps: expected an object' };
    }
    for (const k of STEP_KEYS) {
      if (steps[k] !== undefined) {
        const st = steps[k] as Record<string, unknown>;
        if (!st || typeof st !== 'object' || Array.isArray(st)) {
          return { ok: false, error: `Invalid steps.${k}: expected an object` };
        }
        if (!isStepStatus(st.status)) {
          return { ok: false, error: `Invalid steps.${k}.status: expected pending, done, or skipped` };
        }
        if (st.updatedAt !== undefined && typeof st.updatedAt !== 'string') {
          return { ok: false, error: `Invalid steps.${k}.updatedAt: expected a string` };
        }
      }
    }
  }
  // Unknown top-level keys are dropped by mergeOnboardingState, not rejected.
  return { ok: true, patch: s };
}

/** Normalize the account email used as the onboarding key. */
export function normalizeOnboardingEmail(email: unknown): string | null {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return null;
  return e;
}

/**
 * State returned for accounts created before onboarding existed (no row).
 * They are treated as already seen/dismissed — never force-onboarded — but
 * can still restart manually via the account menu's Setup guide.
 */
export function legacyOnboardingState(): OnboardingState {
  return { ...defaultOnboardingState(), welcomeSeen: true, dismissed: true };
}
