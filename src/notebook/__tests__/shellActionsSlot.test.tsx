import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
vi.mock('../useNotebookMobile', () => ({ useNotebookMobile: () => false }));
import { NotebookRibbonShell } from '../NotebookToolbar';
import { useShellActionsSlot } from '../../modern/chrome/shellActionsSlot';
afterEach(cleanup);

let current: HTMLElement | null = null;
function Probe() { current = useShellActionsSlot(); return null; }
const panes = (active: 'main' | 'other' | 'main-only') => <>
  <Probe />
  <div data-pane="main" hidden={active === 'other'}><NotebookRibbonShell loading={false} /></div>
  {active !== 'main-only' && <div data-pane="other" hidden={active !== 'other'}><NotebookRibbonShell loading={false} /></div>}
</>;
const holder = () => current?.closest('[data-pane]')?.getAttribute('data-pane');

describe('the app controls in split view', () => {
  it('follow the visible ribbon and come back when the other pane closes', () => {
    const view = render(panes('main'));
    expect(holder()).toBe('main');
    view.rerender(panes('other'));
    expect(holder()).toBe('other');
    view.rerender(panes('main'));
    expect(holder()).toBe('main');
    view.rerender(panes('other'));
    view.rerender(panes('main-only')); // the other pane closes while it held the controls
    expect(holder()).toBe('main');
    expect(current?.isConnected).toBe(true);
  });
});
