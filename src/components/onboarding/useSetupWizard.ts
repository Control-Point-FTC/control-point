// Shared setup-wizard logic (2026 redesign): steps, the profile form (name /
// role are drafted with the step, so a look switch mid-setup keeps them), skip
// and tour bookkeeping, and the leave-with-unsaved-changes check. Classic
// SetupWizard and the Modern setup dialog both render it.
import { useEffect, useRef, useState } from 'react';
import { buildProfilePatch, validateProfileInput } from './onboardingState';
import { confirmDialog } from '../dialog';
import { useTheme } from '../../hooks/useTheme';
import { deleteDraft, useDraft } from '../../modern/drafts';
import type { SetupWizardProps } from './SetupWizard';

const K = { step: 'onboarding:wizard-step', name: 'onboarding:wizard-name', role: 'onboarding:wizard-role' };
/** Forget a finished or abandoned setup's drafts. */
export function clearSetupDrafts() {
  Object.values(K).forEach(deleteDraft);
}

export function useSetupWizard({ user, initialStep = 0, state, onPatchState, onSaveProfile, onProfileChanged, onClose }: SetupWizardProps) {
  const [step, setStep] = useDraft<0 | 1 | 2 | 3>(K.step, initialStep);
  const [name, setName] = useDraft(K.name, user.name || '');
  const [role, setRole] = useDraft(K.role, user.role || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ profile: string; tour: string }>(() => ({
    profile: state.steps.profile.status,
    tour: state.steps.tour.status,
  }));
  const { theme, setTheme } = useTheme();
  const dirtyRef = useRef(false);

  // Direction-aware transitions, derived from step changes so every
  // navigation path (save, skip, back buttons) glides the right way.
  const stepRef = useRef(step);
  const [dir, setDir] = useState(1);
  useEffect(() => {
    setDir(step >= stepRef.current ? 1 : -1);
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    dirtyRef.current = name.trim() !== (user.name || '').trim() || role.trim() !== (user.role || '').trim();
  }, [name, role, user.name, user.role]);

  const handleClose = async () => {
    if (dirtyRef.current && step === 0) {
      const ok = await confirmDialog({
        title: 'Leave setup?',
        message: 'Your profile changes haven\u2019t been saved yet. You can finish setup anytime from your account menu.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    clearSetupDrafts();
    onClose();
  };
  /** Leave from the last step (nothing unsaved). */
  const finish = () => { clearSetupDrafts(); onClose(); };

  const markStep = async (id: 'profile' | 'tour', status: 'done' | 'skipped') => {
    const now = new Date().toISOString();
    await onPatchState({ steps: { [id]: { status, updatedAt: now } } });
  };

  const saveProfile = async (skip: boolean) => {
    setError(null);
    setFieldError(null);
    if (skip) {
      setBusy(true);
      try {
        await markStep('profile', 'skipped');
        setSummary((s) => ({ ...s, profile: 'skipped' }));
        setStep(1);
      } catch (e: any) {
        setError(e?.message || 'Could not save. Please try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const v = validateProfileInput(name);
    if (v) {
      setFieldError(v);
      return;
    }
    setBusy(true);
    try {
      const patch = buildProfilePatch({ name: user.name, role: user.role }, { name, role });
      if (patch) {
        await onSaveProfile(patch);
        onProfileChanged(patch.name, patch.role);
      }
      await markStep('profile', 'done');
      setSummary((s) => ({ ...s, profile: 'done' }));
      setStep(1);
    } catch (e: any) {
      setError(e?.message || 'Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const skipTour = async () => {
    setBusy(true);
    setError(null);
    try {
      await markStep('tour', 'skipped');
      setSummary((s) => ({ ...s, tour: 'skipped' }));
      setStep(3);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return {
    step, setStep, dir, name, setName, role, setRole, busy, error, setError, fieldError, summary, theme, setTheme,
    handleClose, finish, saveProfile, skipTour,
  };
}
