import * as Y from 'yjs';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from '@tiptap/y-tiptap';
import { BLOCK_TYPES, notebookSchema, validatedNotebookDocument } from '../src/notebook/editorSchema.js';
import { randomUUID } from 'node:crypto';
import { BACKGROUND_KEY, canvasJSON, seedCanvas } from '../src/notebook/canvasModel.js';

export function seedNotebookDocument(content: unknown, title: string, canvas: unknown = {}): Y.Doc {
  const json = structuredClone(validatedNotebookDocument(content));
  const identify = (node: any) => {
    if (BLOCK_TYPES.includes(node.type) && node.attrs?.id == null) node.attrs = { ...node.attrs, id: randomUUID() };
    for (const child of node.content ?? []) identify(child);
  };
  identify(json);
  const doc = prosemirrorJSONToYDoc(notebookSchema, json, 'prosemirror');
  doc.getMap('meta').set('title', title);
  seedCanvas(doc, canvas);
  return doc;
}

export function notebookDocumentJSON(doc: Y.Doc) {
  // Unknown roots cannot become a hidden store for unsupported/AI content.
  for (const name of doc.share.keys()) if (!['prosemirror', 'meta', 'canvas'].includes(name)) throw new Error('Unsupported shared document field');
  const meta = doc.getMap('meta');
  for (const key of meta.keys()) if (key !== 'title' && key !== BACKGROUND_KEY) throw new Error('Unsupported shared document metadata');
  if ((doc.store as any).pendingStructs || (doc.store as any).pendingDs) throw new Error('Incomplete document update; reconnect before saving');
  const content = validatedNotebookDocument(yDocToProsemirrorJSON(doc, 'prosemirror'));
  return { content, title: meta.get('title'), canvas: canvasJSON(doc) };
}
