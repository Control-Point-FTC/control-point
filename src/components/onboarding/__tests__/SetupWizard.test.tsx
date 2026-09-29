/**
 * Scenarios covered:
 *  9. The setup wizard saves profile data through the real PATCH shape
 * 10. Optional steps can be skipped individually
 * 12. Existing profile data is never overwritten (no API call when unchanged)
 * 14. Escape closes the wizard; validation errors are announced
 *     plus: save failures show an error with a retry path
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupWizard from '../SetupWizard';
import { defaultOnboardingState, type OnboardingState } from '../onboardingState';

vi.mock('../../dialog', () => ({
  confirmDialog: vi.fn().mockResolvedValue(true),
}));

afterEach(() => cleanup());

function wizardProps(overrides: Partial<React.ComponentProps<typeof SetupWizard>> = {}) {
  const onPatchState = vi.fn(async () => defaultOnboardingState() as OnboardingState);
  const onSaveProfile = vi.fn(async () => undefined);
  const onProfileChanged = vi.fn();
  const onStartTour = vi.fn();
  const onClose = vi.fn();
  render(
    <SetupWizard
      user={{ name: '', role: '' }}
      state={defaultOnboardingState()}
      onPatchState={onPatchState}
      onSaveProfile={onSaveProfile}
      onProfileChanged={onProfileChanged}
      onStartTour={onStartTour}
      onClose={onClose}
      {...overrides}
    />
  );
  return { onPatchState, onSaveProfile, onProfileChanged, onStartTour, onClose };
}

describe('SetupWizard', () => {
  it('scenario 9 — saves the profile and marks the step done', async () => {
    const user = userEvent.setup();
    const { onPatchState, onSaveProfile, onProfileChanged } = wizardProps();
    await user.type(screen.getByLabelText(/display name/i), 'Alex Rivera');
    await user.type(screen.getByLabelText(/role or title/i), 'Build Captain');
    await user.click(screen.getByRole('button', { name: /save & continue/i }));

    expect(onSaveProfile).toHaveBeenCalledWith({ name: 'Alex Rivera', role: 'Build Captain' });
    expect(onProfileChanged).toHaveBeenCalledWith('Alex Rivera', 'Build Captain');
    expect(onPatchState).toHaveBeenCalledWith(
      expect.objectContaining({ steps: expect.objectContaining({ profile: expect.objectContaining({ status: 'done' }) }) })
    );
    // advances to the tour step
    expect(await screen.findByRole('button', { name: /start the tour/i })).toBeInTheDocument();
  });

  it('scenario 12 — unchanged existing profile triggers no PATCH (no overwrite)', async () => {
    const user = userEvent.setup();
    const { onPatchState, onSaveProfile, onProfileChanged } = wizardProps({
      user: { name: 'Alex Rivera', role: 'Build Captain' },
    });
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Alex Rivera');
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(onProfileChanged).not.toHaveBeenCalled();
    expect(onPatchState).toHaveBeenCalledWith(
      expect.objectContaining({ steps: expect.objectContaining({ profile: expect.objectContaining({ status: 'done' }) }) })
    );
  });

  it('scenario 10 — profile step can be skipped', async () => {
    const user = userEvent.setup();
    const { onPatchState, onSaveProfile } = wizardProps();
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(onSaveProfile).not.toHaveBeenCalled();
    expect(onPatchState).toHaveBeenCalledWith(
      expect.objectContaining({ steps: expect.objectContaining({ profile: expect.objectContaining({ status: 'skipped' }) }) })
    );
    expect(await screen.findByRole('button', { name: /start the tour/i })).toBeInTheDocument();
  });

  it('scenario 10 — tour step can be skipped for later', async () => {
    const user = userEvent.setup();
    const { onPatchState } = wizardProps({ initialStep: 1 });
    await user.click(screen.getByRole('button', { name: /maybe later/i }));
    expect(onPatchState).toHaveBeenCalledWith(
      expect.objectContaining({ steps: expect.objectContaining({ tour: expect.objectContaining({ status: 'skipped' }) }) })
    );
    expect(await screen.findByRole('button', { name: /start using control point/i })).toBeInTheDocument();
  });

  it('scenario 10 — tour step can start the tour', async () => {
    const user = userEvent.setup();
    const { onStartTour } = wizardProps({ initialStep: 1 });
    await user.click(screen.getByRole('button', { name: /start the tour/i }));
    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it('scenario 9 — blank display name is rejected with an announced error', async () => {
    const user = userEvent.setup();
    const { onSaveProfile } = wizardProps();
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/display name/i);
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it('save failure shows an error and allows retry', async () => {
    const user = userEvent.setup();
    const { onSaveProfile, onPatchState } = wizardProps();
    onSaveProfile.mockRejectedValueOnce(new Error('Network down'));
    await user.type(screen.getByLabelText(/display name/i), 'Alex');
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(onPatchState).not.toHaveBeenCalled();
    // retry succeeds
    onSaveProfile.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /save & continue/i }));
    expect(onPatchState).toHaveBeenCalled();
  });

  it('scenario 14 — Escape closes the wizard when nothing is dirty', () => {
    const { onClose } = wizardProps();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('announces itself as a modal dialog', () => {
    wizardProps();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'wizard-title');
  });
});
