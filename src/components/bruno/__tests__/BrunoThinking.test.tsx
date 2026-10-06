import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BrunoThinking, thinkingSteps } from '../BrunoThinking';

afterEach(cleanup);

describe('thinkingSteps', () => {
  it('only lists what Bruno is actually given', () => {
    const steps = thinkingSteps({ page: 'Predict', images: 2, pdfs: 0, scouting: true, history: 3 }).map((s) => s.label);
    expect(steps).toEqual(['Looking at Predict', 'Reading 2 screenshots', 'Pulling scouting data', 'Recalling this conversation', 'Thinking it through']);
    expect(thinkingSteps({}).map((s) => s.label)).toEqual(['Thinking it through']);
  });
});

describe('BrunoThinking', () => {
  const steps = thinkingSteps({ page: 'Tasks', history: 1 });
  it('shows a live thinking status while waiting', () => {
    render(<BrunoThinking steps={steps} phase="thinking" startedAt={Date.now()} thoughtMs={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Thinking');
    expect(screen.getByText('Looking at Tasks')).toBeInTheDocument();
  });
  it('shows nothing after a near-instant reply', () => {
    const { container } = render(<BrunoThinking steps={steps} phase="done" startedAt={Date.now()} thoughtMs={40} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('collapses to "Thought for" with expandable steps once text arrives', () => {
    render(<BrunoThinking steps={steps} phase="done" startedAt={Date.now() - 5000} thoughtMs={2300} />);
    const toggle = screen.getByRole('button', { name: /thought for 2\.3s/i });
    expect(screen.queryByText('Looking at Tasks')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Looking at Tasks')).toBeInTheDocument();
  });
});
