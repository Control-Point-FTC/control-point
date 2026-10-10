import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { TaskFromNote, currentLine, linkLineToTask } from '../ribbon/TaskFromNote';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));

const editors: Editor[] = [];
afterEach(() => { cleanup(); vi.resetAllMocks(); editors.splice(0).forEach(e => e.destroy()); });
function make() {
  const editor = new Editor({ extensions: notebookExtensions(false), content: {
    type: 'doc', content: [
      { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Notes' }] },
      { type: 'taskList', attrs: { id: 'l1' }, content: [{ type: 'taskItem', attrs: { id: 't1', checked: false }, content: [{ type: 'paragraph', attrs: { id: 't1p' }, content: [{ type: 'text', text: 'Order spare bolts' }] }] }] },
    ] } });
  editors.push(editor);
  let pos = 0; editor.state.doc.descendants((n, p) => { if (n.textContent === 'Order spare bolts' && n.isTextblock) pos = p + 3; });
  editor.commands.setTextSelection(pos);
  return editor;
}

describe('create a task from a note', () => {
  it('reads the line under the cursor and links it to the new task', () => {
    const editor = make();
    expect(currentLine(editor)).toEqual({ title: 'Order spare bolts', blockId: 't1p' });
    expect(linkLineToTask(editor, 't1p', 42)).toBe(true);
    expect(editor.getText()).toContain('Order spare bolts task');
    expect(JSON.stringify(editor.getJSON())).toContain('/tasks?task=42');
    expect(linkLineToTask(editor, 'gone', 1)).toBe(false);
  });

  it('uses the first line when the whole box is selected', () => {
    const editor = make();
    editor.commands.selectAll();
    expect(currentLine(editor)).toEqual({ title: 'Notes', blockId: 'p1' });
  });

  it('creates the task with assignees, priority, due date and a link back to the line', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => url === '/api/members'
      ? [{ id: 3, name: 'Ana' }, { id: 4, name: 'Lee' }] as any
      : init?.method === 'POST' ? { id: 77 } as any : null as any);
    const editor = make(), notify = vi.fn(), onOpenChange = vi.fn();
    render(<TaskFromNote editor={editor} pageId={12} pageTitle="Build log" open onOpenChange={onOpenChange} notify={notify} />);
    expect((screen.getByLabelText('Task') as HTMLInputElement).value).toBe('Order spare bolts');
    await screen.findByRole('option', { name: 'Lee' });
    const assign = screen.getByLabelText('Assign to') as HTMLSelectElement;
    assign.options[1].selected = true; fireEvent.change(assign);
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Due time'), { target: { value: '15:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const post = vi.mocked(apiJson).mock.calls.find(([u, i]) => u === '/api/tasks' && (i as any)?.method === 'POST')!;
    const body = JSON.parse(String((post[1] as any).body));
    expect(body).toMatchObject({ title: 'Order spare bolts', assignee_ids: [4], priority: 'high', due_date: '2026-10-20', due_time: '15:30' });
    expect(body.description).toContain('Build log');
    expect(body.description).toContain('/notebook/p/12?block=t1p');
    expect(notify).toHaveBeenCalledWith('Task created and linked on this line.');
    expect(JSON.stringify(editor.getJSON())).toContain('/tasks?task=77');
  });

  it('does not create the task twice when retrying after a lost answer', async () => {
    let created: any = null; let posts = 0;
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/members') return [] as any;
      if (url === '/api/tasks' && init?.method === 'POST') { posts++; created = { id: 90, ...JSON.parse(init.body) }; throw new Error('Network error'); }
      if (url === '/api/tasks') return (created ? [created] : []) as any;
      return null as any;
    });
    const editor = make(), onOpenChange = vi.fn();
    render(<TaskFromNote editor={editor} pageId={12} pageTitle="Build log" open onOpenChange={onOpenChange} notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    // The attempted request is locked so edits can't drift from what was sent.
    expect(screen.getByLabelText('Task')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(posts).toBe(1);
    expect(JSON.stringify(editor.getJSON())).toContain('/tasks?task=90');
  });

  it('does not post again when the lookup fails, and resends the same request when nothing was saved', async () => {
    const bodies: string[] = []; let lookup: 'fail' | 'empty' = 'fail';
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/members') return [] as any;
      if (url === '/api/tasks' && init?.method === 'POST') { bodies.push(init.body); if (bodies.length === 1) throw new Error('Network error'); return { id: 5 } as any; }
      if (url === '/api/tasks') { if (lookup === 'fail') throw new Error('Lookup failed'); return [] as any; }
      return null as any;
    });
    const onOpenChange = vi.fn();
    render(<TaskFromNote editor={make()} pageId={12} pageTitle="Build log" open onOpenChange={onOpenChange} notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/Lookup failed/)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    lookup = 'empty';
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(bodies).toEqual([bodies[0], bodies[0]]);
  });

  it('shows why it could not create the task', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') throw new Error('Permission denied: manage_tasks');
      return [] as any;
    });
    render(<TaskFromNote editor={make()} pageId={1} pageTitle="P" open onOpenChange={vi.fn()} notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('manage_tasks');
  });
});
