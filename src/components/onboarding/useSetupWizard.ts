// Shared setup-wizard logic (2026 redesign): steps, the profile form (name /
// role are drafted with the step, so a look switch mid-setup keeps them), skip
// and tour bookkeeping, and the leave-with-unsaved-changes check. Classic
// SetupWizard and the Modern setup dialog both render it.
import { useEffect, useRef, useState } from 'react';
import { buildProfilePatch, validateProfileInput } from './onboardingState';
import { confirmDialog } from '../dialog';
import { useTheme } from '../../hooks/useTheme';
import { deleteDraft, getDraft, newSessionId, setDraft, useDraft } from '../../modern/drafts';
import type { SetupWizardProps } from './SetupWizard';

const K = {
  step: 'onboarding:wizard-step',
  name: 'onboarding:wizard-name',
  role: 'onboarding:wizard-role',
  /** This setup's id: survives a look switch, gone once setup closes. */
  session: 'onboarding:wizard-session',
  /** Modern's failed-layout-save message. */
  layoutError: 'onboarding:layout-error',
};
/** Forget a finished or abandoned setup's drafts. */
export function clearSetupDrafts() {
  Object.values(K).forEach(deleteDraft);
}

export function useSetupWizard(
  { user, initialStep = 0, state, onPatchState, onSaveProfile, onProfileChanged, onClose }: SetupWizardProps,
  /** How to ask before leaving with unsaved edits (Modern asks inside its dialog). */
  confirmLeave: () => Promise<boolean> = () => confirmDialog({
    title: 'Leave setup?',
    message: 'Your profile changes haven’t been saved yet. You can finish setup anytime from your account menu.',
    confirmLabel: 'Leave',
    cancelLabel: 'Keep editing',
  }),
) {
  // A save that finishes after this setup closed (and maybe a new one opened)
  // must not move the new setup's step.
  const [session] = useState(() => {
    let id = getDraft<number | null>(K.session, null);
    if (id == null) { id = newSessionId(); setDraft(K.session, id); }
    return id;
  });
  const stillOpen = () => getDraft<number | null>(K.session, null) === session;
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
      if (!(await confirmLeave())) return;
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
        if (stillOpen()) setStep(1);
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
      if (stillOpen()) setStep(1);
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
      if (stillOpen()) setStep(3);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return {
    step, setStep, dir, name, setName, role, setRole, busy, error, setError, fieldError, summary, theme, setTheme,
    handleClose, finish, saveProfile, skipTour, stillOpen,
  };
}
