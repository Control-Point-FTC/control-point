import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TagSummary, type TaggedBlock } from '../ribbon/TagSummary';
import { NotebookWorkspaceContext, type NotebookWorkspace } from '../workspaceContext';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const block = (over: Partial<TaggedBlock>): TaggedBlock => ({ pageId: 1, pageTitle: 'Drive', sectionId: 4, blockId: 'b1', tag: 'todo', text: 'Order bolts', done: false, updatedAt: '', ...over });
function mount(openPage = vi.fn()) {
  const workspace = { teamId: 3, tree: null, openPage, refreshTree: vi.fn(), openTrash: vi.fn(), toggleStickyNotes: vi.fn(), stickyNotesOpen: false } as NotebookWorkspace;
  render(<NotebookWorkspaceContext.Provider value={workspace}><TagSummary pageId={1} sectionId={4} onClose={vi.fn()} /></NotebookWorkspaceContext.Provider>);
  return openPage;
}

describe('tag summary', () => {
  it('groups tags, filters them, and jumps to the tagged block', async () => {
    vi.mocked(apiJson).mockResolvedValue({ truncated: false, blocks: [
      block({}), block({ blockId: 'b2', text: 'Mount motors', done: true }),
      block({ pageId: 2, pageTitle: 'Strategy', blockId: 'b3', tag: 'question', text: 'Which auto?', done: null }),
    ] } as any);
    const openPage = mount();
    expect(await screen.findByRole('heading', { name: 'To Do 2' })).toBeTruthy();
    expect(vi.mocked(apiJson).mock.calls[0][0]).toBe('/api/notebook/tags?section=4');
    expect(vi.mocked(apiJson).mock.calls[0][1]).toMatchObject({ headers: { 'X-CP-Notebook-Team': '3' } });
    fireEvent.click(screen.getByLabelText('Hide done'));
    expect(screen.queryByText(/Mount motors/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Which tag' }), { target: { value: 'question' } });
    expect(screen.queryByRole('heading', { name: /To Do/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Which auto\?/ }));
    expect(openPage).toHaveBeenCalledWith(2, 'b3');
    fireEvent.change(screen.getByRole('combobox', { name: 'Where to look' }), { target: { value: 'all' } });
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.at(-1)![0]).toBe('/api/notebook/tags'));
  });

  it('says when there is nothing tagged, and shows errors', async () => {
    vi.mocked(apiJson).mockResolvedValueOnce({ truncated: false, blocks: [] } as any);
    mount();
    expect(await screen.findByText(/No tagged notes in this section/)).toBeTruthy();
    vi.mocked(apiJson).mockRejectedValueOnce(new Error('Notebook request failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notebook request failed');
  });
});
