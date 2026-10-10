import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotebookProposalCard } from '../NotebookProposalCard';
import { extractNotebookOps, stripNotebookBlocks } from '../../../services/notebookProposals';
import { stripEventBlocks } from '../../../services/aiService';

const apiJson = vi.fn();
vi.mock('../../../services/api', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }));

const body = (call: number) => JSON.parse(apiJson.mock.calls[call][1].body);
const card = (ops: Record<string, unknown>[]) => render(<MemoryRouter><NotebookProposalCard ops={ops} /></MemoryRouter>);

describe('notebook proposal blocks', () => {
  it('extracts operations, including Markdown that quotes code fences', () => {
    const text = 'Adding it.\n```notebook\n[{"op":"append","page":3,"markdown":"```java\\nint x;\\n```"}]\n```';
    expect(extractNotebookOps(text)).toEqual([{ op: 'append', page: 3, markdown: '```java\nint x;\n```' }]);
    expect(stripEventBlocks(text)).toBe('Adding it.');
    expect(stripNotebookBlocks('Hi\n```notebook\n[{"op":"del')).toBe('Hi\n');
    expect(extractNotebookOps('```notebook\nnot json\n```')).toEqual([]);
  });
});

describe('NotebookProposalCard', () => {
  beforeEach(() => apiJson.mockReset());
  afterEach(cleanup);

  it('shows the server preview and applies once with a stable receipt across retries', async () => {
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'append', summary: 'Add to "Log"', after: '- Done' }] });
    card([{ op: 'append', page: 1, markdown: '- Done' }]);
    expect(await screen.findByText('Add to "Log"')).toBeTruthy();
    apiJson.mockRejectedValueOnce(new Error('Network down'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('Network down')).toBeTruthy();
    apiJson.mockResolvedValueOnce({ results: [{ op: 'append', pageId: 1, title: 'Log' }], replayed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Notebook updated/)).toBeTruthy();
    expect(body(1).receipt).toBe(body(2).receipt);
    expect(screen.getByRole('link', { name: 'Open “Log”' }).getAttribute('href')).toBe('/notebook/p/1');
  });

  it('blocks apply when any page is unavailable to Bruno', async () => {
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'rename', summary: "A page Bruno can't access", error: "This page isn't available to Bruno." }] });
    card([{ op: 'rename', page: 9, title: 'x' }]);
    expect(await screen.findByText("This page isn't available to Bruno.")).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires an explicit tick before a deletion can be applied', async () => {
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'delete', summary: 'Move "Old" and its subpages to the trash', destructive: true }] });
    card([{ op: 'delete', page: 2 }]);
    await screen.findByText(/Move "Old"/);
    const apply = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(apply.disabled).toBe(false));
  });
});
