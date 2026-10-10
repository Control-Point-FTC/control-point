// Notes ↔ records: links from a notebook page to a task or a meeting, and
// meeting details dropped into a page. Links are ordinary links to the
// record's place in the app, so they open with the reader's own
// permissions; a record they can't see simply isn't shown there.
import type { Editor } from '@tiptap/core';

export type TaskRecord = { id: number; title: string; status?: string; due_date?: string | null; due_time?: string | null; priority?: string | null };
export type EventRecord = { id: number; title: string; date?: string | null; start_time?: string | null; end_time?: string | null; location?: string | null; description?: string | null; event_type?: string | null };

export const taskHref = (id: number) => `/tasks?task=${id}`;
export const eventHref = (id: number) => `/calendar?event=${id}`;

const APP_PATHS = ['/tasks', '/calendar', '/inventory', '/cad', '/cad-docs', '/cad-parts', '/cad-reviews', '/stats', '/predict'];
/** An in-app (non-notebook) path a notebook link points to, or null. */
export function appRecordPath(href: string | null | undefined, origin = window.location.origin): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !APP_PATHS.includes(url.pathname)) return null;
    return url.pathname + url.search;
  } catch { return null; }
}

export function eventWhen(event: EventRecord): string {
  const parts: string[] = [];
  if (event.date) {
    const [y, m, d] = event.date.split('-').map(Number);
    parts.push(new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
  }
  if (event.start_time) parts.push(event.end_time ? `${event.start_time}–${event.end_time}` : event.start_time);
  if (event.location) parts.push(event.location);
  return parts.join(' · ');
}

export function insertRecordLink(editor: Editor, href: string, text: string) {
  editor.chain().focus().insertContent([{ type: 'text', text: text || 'Untitled', marks: [{ type: 'link', attrs: { href } }] }, { type: 'text', text: ' ' }]).run();
}

/** Meeting details: the meeting's name (linked), when and where, and its
 *  description, ready for notes underneath. */
export function insertMeetingDetails(editor: Editor, event: EventRecord) {
  const content: Record<string, unknown>[] = [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: event.title || 'Meeting', marks: [{ type: 'link', attrs: { href: eventHref(event.id) } }] }] },
  ];
  const when = eventWhen(event);
  if (when) content.push({ type: 'paragraph', content: [{ type: 'text', text: when, marks: [{ type: 'italic' }] }] });
  if (event.description?.trim()) content.push({ type: 'paragraph', content: [{ type: 'text', text: event.description.trim().slice(0, 2000) }] });
  content.push({ type: 'paragraph' });
  editor.chain().focus().insertContent(content).run();
}
