import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '../../components/ui-kit';
import { TipsBar, tipsFor } from '../chrome/TipsBar';
import { BugButton } from '../chrome/BugButton';
import { useRef } from 'react';
import { useCornerSlot } from '../chrome/useCornerSlot';

afterEach(cleanup);

describe('Tips bar (persistent, every page)', () => {
  it('shows a tip for the page first, then the general ones', () => {
    expect(tipsFor('/stats')[0]).toMatch(/Scout works offline/);
    expect(tipsFor('/stats?mode=scout')[0]).toMatch(/Scout works offline/);
    expect(tipsFor('/somewhere-new')[0]).toMatch(/Ctrl K/);
  });

  it('cycles with Next tip and has no close button', () => {
    render(<TipsBar path="/tasks" />);
    const note = screen.getByRole('note', { name: 'Tip' });
    const first = note.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Next tip/ }));
    expect(note.textContent).not.toBe(first);
    expect(screen.queryByRole('button', { name: /close|dismiss/i })).not.toBeInTheDocument();
  });

  it('starts over with the new page’s tips on navigation', () => {
    const { rerender } = render(<TipsBar path="/tasks" />);
    fireEvent.click(screen.getByRole('button', { name: /Next tip/ }));
    rerender(<TipsBar path="/calendar" />);
    expect(screen.getByRole('note', { name: 'Tip' }).textContent).toMatch(/Click a day/);
  });
});

describe('Bug button', () => {
  it('is a labelled, positioned button that opens the report', () => {
    const onClick = vi.fn();
    render(<TooltipProvider><BugButton onClick={onClick} /></TooltipProvider>);
    const btn = screen.getByRole('button', { name: 'Report a bug' });
    expect(btn.className).toContain('cp-fab');
    expect(btn.className).toContain('fixed');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('corner lanes', () => {
  function Card({ visible }: { visible: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useCornerSlot('banner', ref, visible);
    return visible ? <div ref={ref}>banner</div> : null;
  }
  it('a shown card reserves its lane; hiding it frees the lane', () => {
    const { rerender } = render(<Card visible />);
    expect(document.documentElement.style.getPropertyValue('--cp-slot-banner')).toMatch(/px$/);
    rerender(<Card visible={false} />);
    expect(document.documentElement.style.getPropertyValue('--cp-slot-banner')).toBe('');
  });
});
