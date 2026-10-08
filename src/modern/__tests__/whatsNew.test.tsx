import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WhatsNewDialog } from '../pages/WhatsNewDialog';
import { CHANGELOG } from '../../utils/changelog';
import { hasUnseenUpdate } from '../../components/WhatsNewModal';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
afterEach(() => { cleanup(); localStorage.clear(); });

describe('Modern What’s new', () => {
  it('opens on the latest release, marks it seen and lets you browse older ones', () => {
    expect(hasUnseenUpdate()).toBe(true);
    const onClose = vi.fn();
    render(<WhatsNewDialog open onClose={onClose} />);
    expect(hasUnseenUpdate()).toBe(false);
    expect(screen.getByRole('heading', { name: CHANGELOG[0].title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `v${CHANGELOG[1].version}` }));
    expect(screen.getByRole('heading', { name: CHANGELOG[1].title })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('newest first: 3.5.0 (V3.5), 3.0.0 (V3), then the 2.0.0 redesign', () => {
    expect(CHANGELOG.slice(0, 3).map((e) => e.version)).toEqual(['3.5.0', '3.0.0', '2.0.0']);
  });
});
