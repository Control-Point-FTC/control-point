/**
 * Scenarios covered:
 *  5. Each walkthrough step shows title / explanation / targeted element
 *  6. The tour can be exited early
 *  7. Finishing the tour shows the completion screen and reports the outcome
 *  8. A missing target falls back gracefully (no crash, content still shown)
 * 14. Keyboard navigation (arrows move, Escape exits)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Walkthrough from '../Walkthrough';
import type { TourStep } from '../onboardingState';

// jsdom has no matchMedia — the component queries it for the mobile breakpoint.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const STEPS: TourStep[] = [
  { id: 'a', title: 'Step One', body: 'First explanation', target: 'nav-dashboard' },
  { id: 'b', title: 'Step Two', body: 'Second explanation', target: 'nav-tasks' },
];

function mount(props: Partial<React.ComponentProps<typeof Walkthrough>> = {}) {
  document.body.innerHTML = `
    <button data-onboard="nav-dashboard">Dashboard</button>
    <button data-onboard="nav-tasks">Tasks</button>
  `;
  return render(
    <Walkthrough
      steps={STEPS}
      onStepChange={vi.fn()}
      onFinish={vi.fn()}
      onExit={vi.fn()}
      {...props}
    />
  );
}

describe('Walkthrough', () => {
  it('scenario 5 — shows the current step title, body, and progress', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    expect(screen.getByText('First explanation')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('scenario 5 — Next advances through steps; Back returns', async () => {
    const onStepChange = vi.fn();
    const user = userEvent.setup();
    mount({ onStepChange });
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    expect(onStepChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    expect(onStepChange).toHaveBeenCalledWith(0);
  });

  it('scenario 6 — the X button exits the tour early', async () => {
    const onExit = vi.fn();
    const user = userEvent.setup();
    mount({ onExit });
    await user.click(screen.getByRole('button', { name: /exit tour/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('scenario 6 — Skip tour exits without completing', async () => {
    const onExit = vi.fn();
    const onFinish = vi.fn();
    const user = userEvent.setup();
    mount({ onExit, onFinish });
    await user.click(screen.getByRole('button', { name: /skip tour/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('scenario 7 — finishing the last step shows the completion screen', async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    mount({ onFinish });
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /^finish$/i }));
    expect(screen.getByRole('heading', { name: /you're ready/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continue setup/i }));
    expect(onFinish).toHaveBeenCalledWith('setup');
  });

  it('scenario 7 — completion offers exploring on your own', async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    mount({ onFinish });
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('button', { name: /^finish$/i }));
    await user.click(screen.getByRole('button', { name: /explore on my own/i }));
    expect(onFinish).toHaveBeenCalledWith('explore');
  });

  it('scenario 8 — a missing target falls back to a centered card, no crash', () => {
    document.body.innerHTML = `<button data-onboard="nav-dashboard">Dashboard</button>`;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Walkthrough
        steps={[{ id: 'x', title: 'Ghost step', body: 'Target is gone', target: 'nav-nope' }]}
        onFinish={vi.fn()}
        onExit={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Ghost step' })).toBeInTheDocument();
    expect(screen.getByText('Target is gone')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('scenario 14 — ArrowRight/ArrowLeft move, Escape exits', () => {
    const onExit = vi.fn();
    const onStepChange = vi.fn();
    mount({ onExit, onStepChange });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: 'Step One' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('resumes at the given initial step', () => {
    mount({ initialStep: 1 });
    expect(screen.getByRole('heading', { name: 'Step Two' })).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 2/i)).toBeInTheDocument();
  });
});
