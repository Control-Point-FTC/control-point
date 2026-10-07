import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readMobileTabs, resolveMobileTabs, saveMobileTabs, DEFAULT_MOBILE_TABS } from '../chrome/mobileTabs';
import { CustomizeTabsDialog } from '../chrome/CustomizeTabsDialog';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const all = () => true;

describe('phone tab bar', () => {
  it('defaults to Home / Compete / Tasks', () => {
    expect(readMobileTabs()).toEqual(DEFAULT_MOBILE_TABS);
    expect(resolveMobileTabs(readMobileTabs(), all).map((t) => t.label)).toEqual(['Home', 'Compete', 'Tasks']);
  });

  it('keeps saved picks, drops ones this account can’t open, and tops up', () => {
    saveMobileTabs(['chat', 'budget', 'calendar']);
    const noBudget = (id: string) => id !== 'budget';
    expect(resolveMobileTabs(readMobileTabs(), noBudget).map((t) => t.id)).toEqual(['chat', 'calendar', 'dashboard']);
  });

  it('never repeats a tab and ignores unknown ids', () => {
    expect(resolveMobileTabs(['tasks', 'tasks', 'nope'], all).map((t) => t.id)).toEqual(['tasks', 'dashboard', 'stats']);
  });

  it('a corrupt stored value falls back to the defaults', () => {
    localStorage.setItem('cp-mobile-tabs', '{oops');
    expect(readMobileTabs()).toEqual(DEFAULT_MOBILE_TABS);
  });

  it('the customize dialog refuses duplicates and saves three picks', () => {
    const onSave = vi.fn();
    render(<CustomizeTabsDialog open onOpenChange={() => {}} current={resolveMobileTabs(DEFAULT_MOBILE_TABS, all)} allowed={all} onSave={onSave} />);
    expect(screen.getByText(/Bruno and More always stay/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(['dashboard', 'stats', 'tasks']);
  });
});
