import React from 'react';
import { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notebookExtensions } from '../editorSchema';
import { NotebookDiscussions, selectionCommentAnchor } from '../NotebookDiscussions';
import { NotebookSync } from '../NotebookSync';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));
const editors: Editor[] = [], providers: NotebookSync[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); providers.splice(0).forEach(p => p.destroy()); vi.restoreAllMocks(); vi.resetAllMocks(); });
function mount(canComment = true, request?: (url: string) => Promise<any>, canvasTarget?: string) {
  const editor = new Editor({ extensions: notebookExtensions(), content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'saved-drive-block' }, content: [{ type: 'text', text: 'Drive testing' }] }] } }); editors.push(editor);
  const sync = new NotebookSync(7); providers.push(sync); sync.status = 'saved';
  vi.mocked(apiJson).mockImplementation(request ?? (async url => url.endsWith('/mention-members') ? [{ id: 4, name: 'Lee' }] as any : { items: [], next: null, canComment } as any));
  render(<MemoryRouter><NotebookDiscussions sync={sync} editor={editor} canvasTarget={canvasTarget} /></MemoryRouter>);
  return { sync, editor };
}
describe('notebook discussions in the mounted editor', () => {
  it('posts a discussion anchored to a selected drawing ID', async () => {
    mount(true, undefined, 'drawing-one'); await screen.findByRole('textbox', {name:'New discussion'});
    fireEvent.click(screen.getByRole('button',{name:'Anchor to selected drawing'}));
    fireEvent.change(screen.getByRole('textbox',{name:'New discussion'}),{target:{value:'Check this trajectory'}});
    fireEvent.click(screen.getByRole('button',{name:'Post discussion'}));
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([url])=>url.endsWith('/comments'))).toBe(true));
    const call = vi.mocked(apiJson).mock.calls.find(([url])=>url.endsWith('/comments'))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({body:'Check this trajectory',anchor:{kind:'canvas',targetId:'drawing-one'}});
  });
  it('coalesces slow polls so repeated timer ticks cannot starve successful results', async () => {
    let poll!: () => void, finishPeople!: (value: any) => void, peopleCalls = 0;
    const interval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number, ...args: unknown[]) => { if (ms === 5000) poll = fn; return interval(fn, ms, ...args); }) as typeof setInterval);
    mount(true, async url => {
      if (url.endsWith('/mention-members')) { peopleCalls++; return await new Promise(resolve => { finishPeople = resolve; }); }
      return { items: [{ id: 1, anchor: { kind: 'page' }, orphaned: false, resolved: false, commentsBefore: null, comments: [{ id: 1, author: 'Lee', body: 'Slow successful discussion', deleted: false, createdAt: '2026-10-08T00:00:00Z', editedAt: null, canEdit: false, canDelete: false, mentions: [] }] }], next: null, canComment: true };
    });
    await waitFor(() => expect(finishPeople).toBeTypeOf('function'));
    act(() => { poll(); poll(); poll(); });
    expect(peopleCalls).toBe(1);
    await act(async () => { finishPeople([]); await Promise.resolve(); });
    expect(await screen.findByText('Slow successful discussion')).toBeTruthy();
  });
  it('does not let a slow poll hide discussions loaded while teammates are pending', async () => {
    let poll!: () => void, finishPeople!: (value: any) => void, peopleCalls = 0;
    const interval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number, ...args: unknown[]) => { if (ms === 5000) poll = fn; return interval(fn, ms, ...args); }) as typeof setInterval);
    const thread = (id: number) => ({ id, anchor: { kind: 'page' }, orphaned: false, resolved: false, commentsBefore: null, comments: [{ id, author: 'Lee', body: `Discussion ${id}`, deleted: false, createdAt: '2026-10-08T00:00:00Z', editedAt: null, canEdit: false, canDelete: false, mentions: [] }] });
    mount(true, async url => {
      if (url.endsWith('/mention-members')) {
        if (++peopleCalls === 2) return await new Promise(resolve => { finishPeople = resolve; });
        return [];
      }
      const older = url.includes('before=');
      return { items: (older ? [30, 29] : [60, 59]).map(thread), next: older ? null : 59, canComment: true };
    });
    await screen.findByText('Discussion 60');
    act(() => poll());
    await waitFor(() => expect(finishPeople).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Older discussions' }));
    await screen.findByText('Discussion 29');
    await act(async () => { finishPeople([]); await Promise.resolve(); });
    expect(screen.getByText('Discussion 29')).toBeTruthy();
    expect(screen.getByText('Discussion 30')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Older discussions' })).toBeNull();
  });
  it('refreshes older loaded discussions and merges inserted threads without duplicates', async () => {
    let poll!: () => void, changed = false;
    const interval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => void, ms: number, ...args: unknown[]) => { if (ms === 5000) poll = fn; return interval(fn, ms, ...args); }) as typeof setInterval);
    const thread = (id: number) => ({ id, anchor: {kind:'page'}, orphaned:false, resolved:changed && id===20, commentsBefore:null, comments:[{id,author:'Lee',body:changed&&id===20?'Fresh older discussion':`Discussion ${id}`,deleted:false,createdAt:'2026-10-08T00:00:00Z',editedAt:null,canEdit:false,canDelete:false,mentions:[]}] });
    mount(true, async url => {
      if (url.endsWith('/mention-members')) return [];
      const before = Number(new URL(url,'https://test.invalid').searchParams.get('before')) || (changed ? 72 : 71);
      const ids = Array.from({length:before-1},(_,i)=>before-1-i).slice(0,30);
      return {items:ids.map(thread),next:ids.at(-1)!>1?ids.at(-1):null,canComment:true};
    });
    await screen.findByText('Discussion 70');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show resolved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Older discussions' }));
    await screen.findByText('Discussion 20'); changed = true;
    act(() => poll());
    await screen.findByText('Fresh older discussion');
    expect(screen.queryByText('Discussion 20')).toBeNull();
    expect(screen.getAllByText('Discussion 41')).toHaveLength(1);
    expect(screen.getByText('Discussion 71')).toBeTruthy();
  });
  it('anchors selected text to a persisted block ID rather than an absolute page offset', () => {
    const { editor } = mount(); editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(selectionCommentAnchor(editor)).toMatchObject({ kind: 'text', targetId: editor.getJSON().content![0].attrs!.id, start: 0, end: 5, quote: 'Drive' });
    editor.commands.setTextSelection(7); expect(selectionCommentAnchor(editor).kind).toBe('block');
  });
  it('preserves the draft and avoids posting a comment before its anchor reaches the server', async () => {
    const { sync } = mount(); await screen.findByRole('textbox', { name: 'New discussion' });
    sync.doc.getMap('meta').set('title', 'Unsent'); vi.spyOn(sync, 'flush').mockResolvedValue(false);
    fireEvent.change(screen.getByRole('textbox', { name: 'New discussion' }), { target: { value: 'Check the drivetrain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post discussion' }));
    await screen.findByText(/Save the page before adding/);
    expect((screen.getByRole('textbox', { name: 'New discussion' }) as HTMLTextAreaElement).value).toBe('Check the drivetrain');
    expect(vi.mocked(apiJson).mock.calls.some(([url]) => url.endsWith('/comments'))).toBe(false);
  });
  it('posts an anchored comment with explicitly selected, permission-filtered recipients', async () => {
    const { editor } = mount(); await screen.findByRole('textbox', { name: 'New discussion' });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Anchor to selected text or block' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New discussion' }), { target: { value: 'Please inspect' } });
    fireEvent.click(screen.getByText('Mention teammates'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post discussion' }));
    await waitFor(() => expect(vi.mocked(apiJson).mock.calls.some(([url]) => url.endsWith('/comments'))).toBe(true));
    const call = vi.mocked(apiJson).mock.calls.find(([url]) => url.endsWith('/comments'))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ body: 'Please inspect', mentions: [4], anchor: { kind: 'text', quote: 'Drive' } });
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'New discussion' }) as HTMLTextAreaElement).value).toBe(''));
  });
  it('allows readers to view discussions without exposing a comment composer', async () => {
    mount(false); await screen.findByText(/Comments require notebook editing permission/);
    expect(screen.queryByRole('textbox', { name: 'New discussion' })).toBeNull();
  });
});
