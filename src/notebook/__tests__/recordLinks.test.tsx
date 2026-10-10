import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';
import { appRecordPath, eventWhen, insertMeetingDetails } from '../recordLinks';
import { RecordLinkDialog } from '../ribbon/RecordLinkDialog';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<any>(), apiJson: vi.fn() }));

const editors: Editor[] = [];
afterEach(() => { cleanup(); vi.resetAllMocks(); editors.splice(0).forEach(e => e.destroy()); });
const make = () => { const e = new Editor({ extensions: notebookExtensions(false), content: '<p></p>' }); editors.push(e); return e; };

describe('record links', () => {
  it('recognises in-app record links only', () => {
    const origin = 'https://cp.test';
    expect(appRecordPath('/tasks?task=12', origin)).toBe('/tasks?task=12');
    expect(appRecordPath('https://cp.test/calendar?event=3', origin)).toBe('/calendar?event=3');
    expect(appRecordPath('https://evil.test/tasks?task=1', origin)).toBeNull();
    expect(appRecordPath('/notebook/p/4', origin)).toBeNull();
    expect(appRecordPath('/settings', origin)).toBeNull();
  });

  it('writes meeting details: linked title, when and where, description', () => {
    const editor = make();
    insertMeetingDetails(editor, { id: 7, title: 'Design review', date: '2026-10-14', start_time: '18:00', end_time: '19:30', location: 'Shop', description: 'Intake v2' });
    const json = JSON.stringify(editor.getJSON());
    expect(editor.getText()).toContain('Design review');
    expect(editor.getText()).toContain('18:00–19:30 · Shop');
    expect(editor.getText()).toContain('Intake v2');
    expect(json).toContain('/calendar?event=7');
    expect(eventWhen({ id: 1, title: 'x' })).toBe('');
  });

  it('finds a task or meeting and links it, or adds meeting details', async () => {
    vi.mocked(apiJson).mockImplementation(async (url: string) => url === '/api/tasks'
      ? [{ id: 1, title: 'Order bolts', status: 'done' }, { id: 2, title: 'Wire drivetrain', status: 'todo', due_date: '2026-10-20' }] as any
      : [{ id: 9, title: 'Kickoff', date: '2030-01-05', start_time: '10:00' }] as any);
    const editor = make(), onOpenChange = vi.fn();
    render(<RecordLinkDialog editor={editor} open onOpenChange={onOpenChange} />);
    const options = await screen.findAllByRole('button', { name: /Order bolts|Wire drivetrain/ });
    expect(options[0].textContent).toContain('Wire drivetrain'); // open tasks first
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'wire' } });
    fireEvent.click(screen.getByRole('button', { name: /Wire drivetrain/ }));
    expect(JSON.stringify(editor.getJSON())).toContain('/tasks?task=2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Meetings & events' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Meeting details' }));
    expect(editor.getText()).toContain('Kickoff');
  });
});
