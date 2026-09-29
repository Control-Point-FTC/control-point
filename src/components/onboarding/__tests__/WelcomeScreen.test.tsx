/**
 * Scenarios 3 & 4 — the welcome screen's two exits.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomeScreen from '../WelcomeScreen';

afterEach(cleanup);

describe('WelcomeScreen', () => {
  it('scenario 3 — Skip dismisses the entire flow via onSkip', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<WelcomeScreen onGetStarted={vi.fn()} onSkip={onSkip} />);
    await user.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('scenario 4 — Get Started proceeds via onGetStarted', async () => {
    const onGetStarted = vi.fn();
    const user = userEvent.setup();
    render(<WelcomeScreen onGetStarted={onGetStarted} onSkip={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /get started/i }));
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  it('greets the user by first name and mentions the tour stays available', () => {
    render(<WelcomeScreen userName="Alex Rivera" onGetStarted={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /welcome, alex/i })).toBeInTheDocument();
    expect(screen.getByText(/tour is always available from your account menu/i)).toBeInTheDocument();
  });

  it('is announced as a dialog with a labelled heading', () => {
    render(<WelcomeScreen onGetStarted={vi.fn()} onSkip={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-welcome-title');
  });
});
