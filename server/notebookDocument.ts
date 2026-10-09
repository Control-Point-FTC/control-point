import * as Y from 'yjs';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import { notebookSchema, validatedNotebookDocument } from '../src/notebook/editorSchema.js';

export function seedNotebookDocument(content: unknown, title: string): Y.Doc {
  const doc = prosemirrorJSONToYDoc(notebookSchema, validatedNotebookDocument(content), 'prosemirror');
  doc.getMap('meta').set('title', title);
  return doc;
}

export function notebookDocumentJSON(doc: Y.Doc) {
  // Unknown roots cannot become a hidden store for unsupported/AI content.
  for (const name of doc.share.keys()) if (!['prosemirror', 'meta'].includes(name)) throw new Error('Unsupported shared document field');
  const meta = doc.getMap('meta');
  for (const key of meta.keys()) if (key !== 'title') throw new Error('Unsupported shared document metadata');
  if ((doc.store as any).pendingStructs || (doc.store as any).pendingDs) throw new Error('Incomplete document update; reconnect before saving');
  const content = validatedNotebookDocument(yDocToProsemirrorJSON(doc, 'prosemirror'));
  return { content, title: meta.get('title') };
}
