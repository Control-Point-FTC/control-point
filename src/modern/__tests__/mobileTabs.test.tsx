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

  it('the customize dialog changes a pick, refuses duplicates, and survives re-renders', async () => {
    const onSave = vi.fn();
    const props = { open: true, onOpenChange: () => {}, allowed: all, onSave };
    const { rerender } = render(<CustomizeTabsDialog {...props} current={resolveMobileTabs(DEFAULT_MOBILE_TABS, all)} />);
    const pick = async (slot: string, label: string) => {
      fireEvent.keyDown(screen.getByRole('combobox', { name: slot }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('option', { name: label }));
    };
    await pick('Tab 2', 'Messages');
    // The shell re-renders with an equal (new) array: the unsaved pick stays.
    rerender(<CustomizeTabsDialog {...props} current={resolveMobileTabs(DEFAULT_MOBILE_TABS, all)} />);
    expect(screen.getByRole('combobox', { name: 'Tab 2' })).toHaveTextContent('Messages');
    // A duplicate disables Save and says why.
    await pick('Tab 3', 'Messages');
    expect(screen.getByRole('alert')).toHaveTextContent(/different page/);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await pick('Tab 3', 'Calendar');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(['dashboard', 'chat', 'calendar']);
  });
});
