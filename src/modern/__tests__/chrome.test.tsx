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
    expect(tipsFor('/cad-snapshots')[0]).toMatch(/STEP file under Snapshots/);
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

describe('Export menu and printing', async () => {
  const { ExportMenu, installPrintTheme } = await import('../ui/ExportMenu');
  it('offers CSV and print', async () => {
    const onCsv = vi.fn();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<ExportMenu onCsv={onCsv} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /Export/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Download CSV/ }));
    expect(onCsv).toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: /Export/ }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Print or save as PDF/ }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('prints in the light theme and puts the reader’s theme back', () => {
    const root = document.documentElement;
    root.classList.remove('light');
    const off = installPrintTheme();
    window.dispatchEvent(new Event('beforeprint'));
    expect(root.classList.contains('light')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(root.classList.contains('light')).toBe(false);
    // A light-theme reader stays light.
    root.classList.add('light');
    window.dispatchEvent(new Event('beforeprint'));
    window.dispatchEvent(new Event('afterprint'));
    expect(root.classList.contains('light')).toBe(true);
    root.classList.remove('light');
    off();
  });
});
