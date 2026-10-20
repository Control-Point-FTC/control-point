import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BrunoThinking, StreamingCaret, thinkingSteps, writingLabel } from '../BrunoThinking';

afterEach(cleanup);

describe('thinkingSteps', () => {
  it('only lists what Bruno is actually given', () => {
    const steps = thinkingSteps({ page: 'Predict', images: 2, pdfs: 0, scouting: true, history: 3 }).map((s) => s.label);
    expect(steps).toEqual(['Looking at Predict', 'Looking at 2 images', 'Pulling scouting data', 'Recalling this conversation', 'Thinking it through']);
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

describe('while the reply streams', () => {
  const L = String.fromCharCode(10);
  const fence = '```';
  it('says what Bruno is doing: writing, or drafting changes for a confirm card', () => {
    expect(writingLabel('Here are the steps')).toBe('Writing');
    // A code example is shown as it streams: still writing.
    expect(writingLabel(['Try this:', `${fence}java`, 'public class Auto {'].join(L))).toBe('Writing');
    // Lookups never reach the browser; an unknown block isn't a change.
    expect(writingLabel(['Checking.', `${fence}lookup`, '{"kind":"notebook'].join(L))).toBe('Writing');
    expect(writingLabel(['Adding it:', `${fence}tasks`, '[{"title":"Order'].join(L))).toBe('Drafting changes');
    // A finished block: back to writing.
    expect(writingLabel(['Added:', `${fence}tasks`, '[]', fence, 'Anything else'].join(L))).toBe('Writing');
  });
  it('shows three dots and the label under the text, not a lone bar', () => {
    render(<StreamingCaret text={['Adding it:', `${fence}notebook`, '[{"op"'].join(L)} />);
    const chip = screen.getByTestId('bruno-writing');
    expect(chip).toHaveTextContent('Drafting changes…');
    expect(chip.querySelectorAll('.rounded-full.bg-accent')).toHaveLength(3);
    expect(chip).toHaveAttribute('aria-hidden', 'true');
  });
});
