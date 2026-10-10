import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ViewControls, dockFeatures } from '../ribbon/ViewControls';
import { NotebookRibbonShell } from '../NotebookToolbar';
import { NotebookWorkspaceContext, type NotebookWorkspace } from '../workspaceContext';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('View: navigation and dock', () => {
  it('switches between navigation panes and tabs', () => {
    const setNavigationLayout = vi.fn();
    const workspace = { teamId: 1, tree: null, openPage: vi.fn(), refreshTree: vi.fn(), openTrash: vi.fn(), toggleStickyNotes: vi.fn(), stickyNotesOpen: false, navigationLayout: 'panes', setNavigationLayout } as NotebookWorkspace;
    render(<NotebookWorkspaceContext.Provider value={workspace}><ViewControls pageId={7} /></NotebookWorkspaceContext.Provider>);
    expect(screen.getByRole('button', { name: 'Navigation panes' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Tabs layout' }));
    expect(setNavigationLayout).toHaveBeenCalledWith('tabs');
  });

  it('lets you switch layout back with no page open (ribbon shell)', () => {
    const setNavigationLayout = vi.fn();
    const workspace = { teamId: 1, tree: null, openPage: vi.fn(), refreshTree: vi.fn(), openTrash: vi.fn(), toggleStickyNotes: vi.fn(), stickyNotesOpen: false, navigationLayout: 'tabs', setNavigationLayout } as NotebookWorkspace;
    render(<NotebookWorkspaceContext.Provider value={workspace}><NotebookRibbonShell loading={false} /></NotebookWorkspaceContext.Provider>);
    fireEvent.click(screen.getByRole('tab', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Navigation panes' }));
    expect(setNavigationLayout).toHaveBeenCalledWith('panes');
    expect(screen.queryByRole('button', { name: 'Dock window' })).toBeNull(); // needs a page
  });

  it('docks the page in a narrow window on the right, and explains a blocked pop-up', () => {
    expect(dockFeatures({ availWidth: 1920, availHeight: 1040, availLeft: 0, availTop: 0 })).toBe('popup,width=440,height=1040,left=1480,top=0');
    expect(dockFeatures({ availWidth: 300, availHeight: 600 })).toContain('left=0');
    const focus = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValueOnce({ focus } as unknown as Window).mockReturnValueOnce(null);
    render(<ViewControls pageId={7} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dock window' }));
    expect(open).toHaveBeenCalledWith('/notebook/p/7', 'cp-notebook-docked', expect.stringContaining('width=440'));
    expect(focus).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Dock window' }));
    expect(screen.getByRole('status')).toHaveTextContent('blocked');
  });
});
