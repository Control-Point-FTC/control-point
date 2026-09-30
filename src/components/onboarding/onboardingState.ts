// Shared onboarding logic for Control Point: state shape, tour/wizard step
// definitions, and pure helpers. Everything in this file is side-effect free
// and unit-tested (see __tests__/).

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type OnboardingStepStatus = 'pending' | 'done' | 'skipped';

export interface OnboardingStepState {
  status: OnboardingStepStatus;
  updatedAt?: string;
}

export interface OnboardingState {
  version: 1;
  welcomeSeen: boolean;
  dismissed: boolean;
  checklistDismissed: boolean;
  walkthrough: { completed: boolean; lastStep: number };
  steps: { profile: OnboardingStepState; tour: OnboardingStepState };
}

export function defaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    welcomeSeen: false,
    dismissed: false,
    checklistDismissed: false,
    walkthrough: { completed: false, lastStep: 0 },
    steps: { profile: { status: 'pending' }, tour: { status: 'pending' } },
  };
}

/** Merge a server response over defaults (tolerates missing keys). */
export function normalizeOnboardingState(raw: any): OnboardingState {
  const d = defaultOnboardingState();
  if (!raw || typeof raw !== 'object') return d;
  const step = (v: any): OnboardingStepState =>
    v && (v.status === 'done' || v.status === 'skipped' || v.status === 'pending')
      ? { status: v.status, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined }
      : { status: 'pending' };
  return {
    version: 1,
    welcomeSeen: raw.welcomeSeen === true,
    dismissed: raw.dismissed === true,
    checklistDismissed: raw.checklistDismissed === true,
    walkthrough: {
      completed: raw.walkthrough?.completed === true,
      lastStep: typeof raw.walkthrough?.lastStep === 'number' && raw.walkthrough.lastStep >= 0
        ? Math.floor(raw.walkthrough.lastStep) : 0,
    },
    steps: {
      profile: step(raw.steps?.profile),
      tour: step(raw.steps?.tour),
    },
  };
}

/** Show the welcome screen only to users who haven't seen or skipped it. */
export function shouldShowWelcome(s: OnboardingState): boolean {
  return !s.welcomeSeen && !s.dismissed;
}

/** Setup counts as complete only when every step is done (skipped ≠ done). */
export function isSetupComplete(s: OnboardingState): boolean {
  return s.steps.profile.status === 'done' && s.steps.tour.status === 'done';
}

/** Should the dashboard "Complete your setup" card be visible? */
export function shouldShowChecklist(s: OnboardingState): boolean {
  if (s.checklistDismissed || s.dismissed) return false;
  return !isSetupComplete(s);
}

export interface ChecklistItem {
  id: 'profile' | 'tour';
  title: string;
  description: string;
  status: OnboardingStepStatus;
}

export function checklistItems(s: OnboardingState): ChecklistItem[] {
  return [
    {
      id: 'profile',
      title: 'Set up your profile',
      description: 'Your display name and role, as teammates will see them.',
      status: s.steps.profile.status,
    },
    {
      id: 'tour',
      title: 'Take the tour',
      description: 'A quick walkthrough of the workspace.',
      status: s.steps.tour.status,
    },
  ];
}

/** First wizard step that still needs attention (for "Continue setup"). */
export function firstIncompleteWizardStep(s: OnboardingState): 0 | 1 {
  if (s.steps.profile.status !== 'done') return 0;
  return 1;
}

// ---------------------------------------------------------------------------
// Interactive walkthrough steps. `target` is a data-onboard attribute value;
// steps without a target render as a centered card. Copy describes only
// features that actually exist in the app.
// ---------------------------------------------------------------------------

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** data-onboard value of the element to highlight (omit for centered card). */
  target?: string;
  /** Mobile fallback targets (bottom tab bar) when the sidebar item is hidden. */
  mobileTargets?: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'intro',
    title: 'Welcome to Control Point',
    body: 'This is mission control for your robotics team — attendance, tasks, schedule, chat, budget, and outreach, all in one workspace. Let\u2019s take a quick look around.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    body: 'Your home base. See today\u2019s check-in status, the season snapshot, and an AI summary of what\u2019s happening across your team.',
    target: 'nav-dashboard',
    mobileTargets: ['mtab-dashboard'],
  },
  {
    id: 'teams',
    title: 'Teams & Members',
    body: 'Manage your roster here — invite members, assign Discord-style roles, and control who can see or change what.',
    target: 'nav-teams',
  },
  {
    id: 'attendance',
    title: 'Attendance',
    body: 'Run QR code check-in sessions at meetings — project the code, members scan it with their phone camera, and attendance logs itself.',
    target: 'nav-attendance',
    mobileTargets: ['mtab-attendance'],
  },
  {
    id: 'tasks',
    title: 'Tasks',
    body: 'Plan the build season as tasks: assign owners, set due dates, and track everything from CAD to competition prep.',
    target: 'nav-tasks',
    mobileTargets: ['mtab-tasks'],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    body: 'Keep meetings, build sessions, and competition dates in one shared team calendar.',
    target: 'nav-calendar',
  },
  {
    id: 'chat',
    title: 'Messaging',
    body: 'Team chat for quick coordination — with file attachments and @mentions so nothing gets lost.',
    target: 'nav-chat',
    mobileTargets: ['mtab-chat'],
  },
  {
    id: 'outreach',
    title: 'Outreach',
    body: 'Connect your team\u2019s YouTube channel to track subscriber growth automatically over the season.',
    target: 'nav-outreach',
  },
  {
    id: 'bruno',
    title: 'Bruno — your AI assistant',
    body: 'Tap the robot button anytime to chat with Bruno, an FTC build mentor that knows the game manuals and can look things up for you.',
    target: 'header-bruno',
  },
  {
    id: 'profile',
    title: 'My Profile',
    body: 'Your personal space: update your name and avatar, pick your theme colors, and review your own check-in history.',
    target: 'nav-profile',
  },
  {
    id: 'settings',
    title: 'Admin Settings',
    body: 'Admins manage the workspace here: team info, the FTC team connection for live stats, attendance defaults, and more.',
    target: 'nav-settings',
    adminOnly: true,
  } as TourStep & { adminOnly: boolean },
];

export interface TourStepResolved extends TourStep {
  index: number;
}

/** Filter tour steps to what the current user can actually see. */
export function resolveTourSteps(isAdmin: boolean): TourStep[] {
  return TOUR_STEPS.filter((s) => !(s as any).adminOnly || isAdmin);
}

// ---------------------------------------------------------------------------
// Tooltip positioning (pure, tested).
// ---------------------------------------------------------------------------

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export type TooltipPlacement =
  | { kind: 'bottom-sheet' }
  | { kind: 'center' }
  | { kind: 'anchored'; top: number; left: number; width: number; above: boolean };

const TOOLTIP_WIDTH = 340;
const TOOLTIP_GAP = 12;
const TOOLTIP_EST_HEIGHT = 300;

export function computeTooltipPosition(
  rect: Rect | null,
  viewportWidth: number,
  viewportHeight: number,
  isMobile: boolean
): TooltipPlacement {
  if (isMobile) return { kind: 'bottom-sheet' };
  if (!rect) return { kind: 'center' };
  // Target off-screen (e.g. sidebar collapsed into a hidden drawer): center.
  if (rect.right < 0 || rect.left > viewportWidth || rect.bottom < 0 || rect.top > viewportHeight) {
    return { kind: 'center' };
  }
  const width = Math.min(TOOLTIP_WIDTH, viewportWidth - 24);
  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(12, Math.min(left, viewportWidth - width - 12));
  const belowTop = rect.bottom + TOOLTIP_GAP;
  if (belowTop + TOOLTIP_EST_HEIGHT <= viewportHeight) {
    return { kind: 'anchored', top: belowTop, left, width, above: false };
  }
  const aboveTop = rect.top - TOOLTIP_GAP - TOOLTIP_EST_HEIGHT;
  if (aboveTop >= 12) {
    return { kind: 'anchored', top: aboveTop, left, width, above: true };
  }
  // Nowhere sensible — center it.
  return { kind: 'center' };
}

// ---------------------------------------------------------------------------
// Setup wizard helpers.
// ---------------------------------------------------------------------------

/**
 * Build the PATCH /api/profile body for the wizard's profile step.
 * Returns null when nothing changed, so we never overwrite existing data
 * the user didn't explicitly edit.
 */
export function buildProfilePatch(
  current: { name?: string; role?: string },
  edited: { name: string; role: string }
): { name: string; role: string } | null {
  const name = edited.name.trim();
  const role = edited.role.trim();
  const curName = (current.name || '').trim();
  const curRole = (current.role || '').trim();
  if (name === curName && role === curRole) return null;
  return { name, role };
}

export function validateProfileInput(name: string): string | null {
  if (!name.trim()) return 'Please enter your display name.';
  if (name.trim().length > 80) return 'Please keep your name under 80 characters.';
  return null;
}
