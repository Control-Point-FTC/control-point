import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as Y from 'yjs';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import { notebookSchema } from '../editorSchema';
import { NotebookSync, decodeBytes, encodeBytes } from '../NotebookSync';
import { NotebookEditor } from '../NotebookEditor';
import { apiJson, ApiError } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const providers: NotebookSync[] = [], docs: Y.Doc[] = [];
afterEach(() => { cleanup(); providers.splice(0).forEach(p => p.destroy()); docs.splice(0).forEach(d => d.destroy()); vi.resetAllMocks(); });
async function mount(editable = true) {
  const server = prosemirrorJSONToYDoc(notebookSchema, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Team discoveries' }] }] });
  server.getMap('meta').set('title', 'Journal'); docs.push(server);
  vi.mocked(apiJson).mockImplementation(async (url, init) => {
    if (url.endsWith('/backlinks')) return [] as any;
    if (url.endsWith('/threads')) return { items: [], next: null, canComment: editable } as any;
    if (url.endsWith('/mention-members')) return [] as any;
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.update) Y.applyUpdate(server, decodeBytes(body.update));
    return { epoch: 'one', update: encodeBytes(Y.encodeStateAsUpdate(server, body.vector ? decodeBytes(body.vector) : undefined)), vector: encodeBytes(Y.encodeStateVector(server)), title: server.getMap('meta').get('title'), revision: 1, protected: false, editable, updatedBy: 1, updatedAt: 'now', peers: [{ clientId: body.clientId, memberId: 1, name: 'Teammate', color: '#3b82f6', cursor: null, clock: Date.now() }] } as any;
  });
  const sync = new NotebookSync(1); providers.push(sync); await sync.start();
  const navigate = vi.fn();
  render(<MemoryRouter><NotebookEditor sync={sync} onChanged={() => {}} pages={[]} onNavigate={navigate} /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Page content' }).textContent).toContain('Team discoveries'));
  return { sync, server, navigate };
}
describe('mounted collaborative notebook editor', () => {
  it('mounts the real CRDT editor, toolbar and carets, and saves shared titles', async () => {
    const { sync, server } = await mount();
    expect(screen.getByRole('toolbar', { name: 'Note formatting' })).toBeTruthy();
    expect(screen.getByLabelText('People on this page').textContent).toContain('Teammate');
    fireEvent.change(screen.getByRole('textbox', { name: 'Page title' }), { target: { value: 'Shared journal' } });
    await act(async () => { expect(await sync.flush()).toBe(true); });
    expect(server.getMap('meta').get('title')).toBe('Shared journal');
    expect(yDocToProsemirrorJSON(server).content[0].content[0].text).toBe('Team discoveries');
  });
  it('keeps readers unable to edit while rendering saved advanced content', async () => {
    await mount(false);
    expect(screen.getByRole('textbox', { name: 'Page title' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Page content' }).getAttribute('contenteditable')).toBe('false');
    fireEvent.click(screen.getByRole('tab', { name: 'Insert' }));
    expect(screen.getByRole('button', { name: /^Table$/ }).hasAttribute('disabled')).toBe(true);
    expect(providers[0].pending).toBe(false);
  });
  it('removes the editor and its title when protected-page access is revoked', async () => {
    const { sync } = await mount();
    vi.mocked(apiJson).mockRejectedValueOnce(new ApiError(404, 'Unavailable'));
    await act(async () => { await sync.flush(); });
    expect(screen.queryByRole('textbox', { name: 'Page content' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Page title' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('cannot be opened');
  });
});
