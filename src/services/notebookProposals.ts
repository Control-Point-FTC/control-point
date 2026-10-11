// Bruno's proposed notebook changes (a ```notebook block in its reply). The
// card asks the server to describe them (under Bruno's access) and applies
// them only when the member confirms. One receipt key per card: a retry after
// a lost response replays the first result instead of writing twice.
import { useState } from 'react';
import { apiJson } from './api';

export type NotebookOpPreview = { op: 'create' | 'append' | 'replace' | 'rename' | 'move' | 'delete' | 'sticky_create' | 'sticky_edit' | 'sticky_delete'; summary: string; before?: string; after?: string; destructive?: boolean; error?: string };
/** Page changes report pageId; sticky note changes report noteId. */
export type NotebookOpResult = { op: NotebookOpPreview['op']; pageId?: number; noteId?: number; title: string };
/** Sticky note changes travel in the same block but always get their own card. */
export const isStickyOp = (op: Record<string, unknown>) => typeof op.op === 'string' && op.op.startsWith('sticky_');

const BLOCK_RE = /```notebook\s*\r?\n([\s\S]*?)\r?\n```/g;
export const MAX_NOTEBOOK_OPS = 10;

/** The notebook page operations a reply proposes (all blocks, at most 10). */
export function extractNotebookOps(text: string): Record<string, unknown>[] {
  return allOps(text).filter(op => !isStickyOp(op)).slice(0, MAX_NOTEBOOK_OPS);
}
/** The sticky note operations a reply proposes (at most 10). */
export function extractStickyOps(text: string): Record<string, unknown>[] {
  return allOps(text).filter(isStickyOp).slice(0, MAX_NOTEBOOK_OPS);
}
function allOps(text: string): Record<string, unknown>[] {
  const ops: Record<string, unknown>[] = [];
  for (const m of String(text || '').matchAll(BLOCK_RE)) {
    try {
      const parsed = JSON.parse(m[1]);
      for (const op of Array.isArray(parsed) ? parsed : [parsed]) if (op && typeof op === 'object' && typeof op.op === 'string') ops.push(op);
    } catch { /* malformed block: no card */ }
  }
  return ops;
}

/** Remove notebook blocks (and a trailing unfinished one while streaming). */
export function stripNotebookBlocks(text: string): string {
  return String(text || '').replace(BLOCK_RE, '').replace(/```notebook[\s\S]*$/, '');
}

export function previewNotebookOps(ops: Record<string, unknown>[], signal?: AbortSignal) {
  return apiJson<{ previews: NotebookOpPreview[] }>('/api/ai/notebook/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }), signal });
}

export async function applyNotebookOps(ops: Record<string, unknown>[], receipt: string) {
  const out = await apiJson<{ results: NotebookOpResult[]; replayed: boolean }>('/api/ai/notebook/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops, receipt }) });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bruno-data-changed', { detail: { types: [ops.every(isStickyOp) ? 'sticky' : 'notebook'] } }));
  return out;
}

/** Identifies the conversation a card belongs to: the saved chat id (unique
 *  across members and workspaces), or a token for an unsaved conversation. */
export function conversationScope(chatId: number | null | undefined, draftToken: string): string {
  return chatId ? `chat:${chatId}` : `draft:${draftToken}`;
}

/** 128 random bits as hex. getRandomValues works outside secure contexts
 *  (plain-HTTP LAN use), unlike randomUUID; a last resort keeps rendering. */
export function newReceiptKey(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `nb_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

/** A per-mount key, generated once (not on every render). */
export function useReceiptKey() {
  return useState(newReceiptKey)[0];
}
