import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotebookProposalCard } from '../NotebookProposalCard';
import { extractNotebookOps, extractStickyOps, stripNotebookBlocks } from '../../../services/notebookProposals';
import { stripEventBlocks } from '../../../services/aiService';

const apiJson = vi.fn();
vi.mock('../../../services/api', () => ({ apiJson: (...args: unknown[]) => apiJson(...args) }));

const body = (call: number) => JSON.parse(apiJson.mock.calls[call][1].body);
let scopeN = 0;
const card = (ops: Record<string, unknown>[], scope = `reply-${++scopeN}`) => render(<MemoryRouter><NotebookProposalCard ops={ops} scope={scope} /></MemoryRouter>);

describe('notebook proposal blocks', () => {
  it('extracts operations, including Markdown that quotes code fences', () => {
    const text = 'Adding it.\n```notebook\n[{"op":"append","page":3,"markdown":"```java\\nint x;\\n```"}]\n```';
    expect(extractNotebookOps(text)).toEqual([{ op: 'append', page: 3, markdown: '```java\nint x;\n```' }]);
    expect(stripEventBlocks(text)).toBe('Adding it.');
    expect(stripNotebookBlocks('Hi\n```notebook\n[{"op":"del')).toBe('Hi\n');
    expect(extractNotebookOps('```notebook\nnot json\n```')).toEqual([]);
  });
  it('splits sticky note changes into their own card', () => {
    const text = '```notebook\n[{"op":"sticky_create","body":"Bolts"},{"op":"append","page":3,"markdown":"x"}]\n```';
    expect(extractNotebookOps(text)).toEqual([{ op: 'append', page: 3, markdown: 'x' }]);
    expect(extractStickyOps(text)).toEqual([{ op: 'sticky_create', body: 'Bolts' }]);
  });
});

describe('sticky note cards', () => {
  beforeEach(() => apiJson.mockReset());
  afterEach(cleanup);
  it('speaks about sticky notes, applies, tells the panel to refresh, and opens it', async () => {
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'sticky_create', summary: 'New sticky note', after: 'Bolts' }] });
    card([{ op: 'sticky_create', body: 'Bolts' }]);
    expect(await screen.findByText('New sticky note')).toBeTruthy();
    expect(screen.getByText(/Apply 1 sticky note change\?/)).toBeTruthy();
    expect(screen.getByText('Only your own sticky notes change.')).toBeTruthy();
    const changed = vi.fn(); window.addEventListener('bruno-data-changed', changed);
    apiJson.mockResolvedValueOnce({ results: [{ op: 'sticky_create', noteId: 5, title: 'Bolts' }], replayed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(/Sticky notes updated/)).toBeTruthy();
    expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ types: ['sticky'] });
    window.removeEventListener('bruno-data-changed', changed);
    const { useStickyNotesOpen } = await import('../../../notebook/stickyNotesState');
    let open = false; function Probe() { open = useStickyNotesOpen(); return null; }
    render(<Probe />);
    fireEvent.click(screen.getByRole('button', { name: 'Open sticky notes' }));
    await waitFor(() => expect(open).toBe(true));
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

  it('a reopened chat keeps the same receipt, and a finished card stays finished', async () => {
    const ops = [{ op: 'create', title: 'Once' }];
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'create', summary: 'New page "Once" in Build' }] });
    const first = card(ops, 'reply-7');
    await screen.findByText('New page "Once" in Build');
    apiJson.mockRejectedValueOnce(new Error('Response lost'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText('Response lost');
    first.unmount();
    // The dock closed and reopened: same reply, new card instance.
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'create', summary: 'New page "Once" in Build' }] });
    const second = card(ops, 'reply-7');
    await screen.findByText('New page "Once" in Build');
    apiJson.mockResolvedValueOnce({ results: [{ op: 'create', pageId: 4, title: 'Once' }], replayed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await screen.findByText(/Notebook updated/);
    expect(body(1).receipt).toBe(body(3).receipt);
    second.unmount();
    apiJson.mockReset();
    const third = card(ops, 'reply-7');
    expect(screen.getByText(/Notebook updated/)).toBeTruthy();
    expect(apiJson).not.toHaveBeenCalled();
    third.unmount();
    // The same reply text in a different conversation is a new proposal.
    apiJson.mockResolvedValueOnce({ previews: [{ op: 'create', summary: 'New page "Once" in Build' }] });
    card(ops, 'chat:99:reply-7');
    expect(await screen.findByRole('button', { name: 'Apply' })).toBeTruthy();
    expect(screen.queryByText(/Notebook updated/)).toBeNull();
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

describe('receipt keys', () => {
  it('work without crypto.randomUUID (plain-HTTP LAN use)', async () => {
    const { newReceiptKey } = await import('../../../services/notebookProposals');
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = newReceiptKey(), b = newReceiptKey();
      expect(a).toMatch(/^nb_[0-9a-f]{32}$/);
      expect(a).not.toBe(b);
    } finally { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true }); }
  });
});
