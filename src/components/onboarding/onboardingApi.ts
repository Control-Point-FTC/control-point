// API client for onboarding state. All calls are session-scoped: the server
// derives the account from the session, so callers can never address another
// user's state.
import { apiFetch } from '../../services/api';
import { normalizeOnboardingState, type OnboardingState } from './onboardingState';

export async function fetchOnboardingState(): Promise<OnboardingState> {
  const res = await apiFetch('/api/onboarding', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load onboarding progress');
  const data = await res.json();
  return normalizeOnboardingState(data?.state);
}

export async function saveOnboardingState(patch: Record<string, unknown>): Promise<OnboardingState> {
  const res = await apiFetch('/api/onboarding', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: patch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Could not save onboarding progress');
  return normalizeOnboardingState(data?.state);
}
