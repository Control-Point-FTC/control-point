// Bruno and the member's own sticky notes (Settings → Bruno → My sticky notes).
//
// Reading: a {"kind":"sticky_notes"} lookup lists the asking member's notes
// in the active team, and nobody else's. Writing: Bruno proposes
// sticky_create / sticky_edit / sticky_delete in the same ```notebook card as
// page changes (one card holds one kind). The member confirms, then the card
// runs in one transaction, keyed by a receipt so a retried confirm never
// writes twice. Note text was typed by the member: it is data, never
// instructions to Bruno.
import type { NotebookStore, NotebookContext } from "./notebook.js";
import { NotebookError } from "./notebook.js";
import { MAX_STICKY_TEXT, STICKY_COLORS, StickyError, StickyNotes } from "./stickyNotes.js";

export type StickyOp =
  | { op: "sticky_create"; body: string; color?: string }
  | { op: "sticky_edit"; note: number; body?: string; color?: string }
  | { op: "sticky_delete"; note: number };
export type StickyOpPreview = { op: StickyOp["op"]; summary: string; before?: string; after?: string; error?: string; destructive?: boolean };
export type StickyOpResult = { op: StickyOp["op"]; noteId: number; title: string };

const STICKY_OPS = ["sticky_create", "sticky_edit", "sticky_delete"] as const;
export const MAX_STICKY_OPS = 10;
const LOOKUP_NOTE_CHARS = 1500;
const bad = (msg: string) => new NotebookError(msg, 400);
const noteId = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : undefined; };
const firstLine = (body: string) => body.split("\n").find(l => l.trim())?.trim().slice(0, 60) || "Empty note";

/** Whether a proposal is a sticky-notes card (every op is a sticky op). */
export function isStickyCard(items: unknown): boolean {
  return Array.isArray(items) && items.length > 0 && items.every(i => typeof i?.op === "string" && i.op.startsWith("sticky_"));
}

export function parseStickyOps(items: unknown): StickyOp[] {
  if (!Array.isArray(items) || !items.length) throw bad("No sticky note changes to apply");
  if (items.length > MAX_STICKY_OPS) throw bad(`At most ${MAX_STICKY_OPS} sticky note changes per confirmation`);
  return items.map((raw: any): StickyOp => {
    if (!raw || !STICKY_OPS.includes(raw.op)) throw bad("Sticky notes and notebook pages go in separate cards");
    const color = raw.color === undefined ? undefined : STICKY_COLORS.includes(raw.color) ? String(raw.color) : null;
    if (color === null) throw bad(`A sticky note color is one of ${STICKY_COLORS.join(", ")}`);
    const body = raw.body === undefined ? undefined : typeof raw.body === "string" && raw.body.length <= MAX_STICKY_TEXT ? raw.body : null;
    if (body === null) throw bad(`Sticky note text is up to ${MAX_STICKY_TEXT} characters`);
    if (raw.op === "sticky_create") {
      if (!body?.trim()) throw bad("A new sticky note needs some text");
      return { op: "sticky_create", body, ...(color ? { color } : {}) };
    }
    const note = noteId(raw.note);
    if (!note) throw bad("A sticky note change needs the note's id");
    if (raw.op === "sticky_delete") return { op: "sticky_delete", note };
    if (body === undefined && !color) throw bad("Say what to change in the sticky note");
    return { op: "sticky_edit", note, ...(body !== undefined ? { body } : {}), ...(color ? { color } : {}) };
  });
}

/** The member's own notes for a lookup (newest first, each clipped). */
export async function stickyLookup(notes: StickyNotes, teamId: number, memberId: number, query?: string): Promise<{ lines: string[]; more: boolean }> {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = (await notes.list(teamId, memberId)).filter(n => words.every(w => n.body.toLowerCase().includes(w)));
  const lines = list.map(n => {
    const text = n.body.length > LOOKUP_NOTE_CHARS ? `${n.body.slice(0, LOOKUP_NOTE_CHARS)}… (note continues)` : n.body;
    return `sticky note #${n.id} (${n.color}, updated ${n.updatedAt}): ${JSON.stringify(text || "(empty)")}`;
  });
  return { lines, more: false };
}

export async function previewStickyOps(notes: StickyNotes, ctx: { teamId: number; memberId: number }, ops: StickyOp[]): Promise<StickyOpPreview[]> {
  const mine = new Map((await notes.list(ctx.teamId, ctx.memberId)).map(n => [n.id, n]));
  return ops.map((op): StickyOpPreview => {
    if (op.op === "sticky_create") return { op: op.op, summary: `New sticky note${op.color ? ` (${op.color})` : ""}`, after: op.body };
    const note = mine.get(op.note);
    if (!note) return { op: op.op, summary: "A sticky note", error: "That sticky note was deleted, or isn't yours." };
    if (op.op === "sticky_delete") return { op: op.op, summary: `Delete sticky note “${firstLine(note.body)}”`, before: note.body, destructive: true };
    return { op: op.op, summary: `Edit sticky note “${firstLine(note.body)}”${op.color && op.color !== note.color ? ` (color: ${op.color})` : ""}`, ...(op.body !== undefined ? { before: note.body, after: op.body } : {}) };
  });
}

/** Confirmed by the member: one transaction, replay-safe by receipt. */
export async function applyStickyOps(store: NotebookStore, ctx: NotebookContext, ops: StickyOp[], receiptKey: string) {
  return store.batchOnce(ctx, receiptKey, () => store.transact(ctx, async tx => {
    const notes = new StickyNotes(tx);
    const results: StickyOpResult[] = [];
    try {
      for (const op of ops) {
        if (op.op === "sticky_create") {
          const note = await notes.create(ctx.teamId, ctx.memberId, { body: op.body, ...(op.color ? { color: op.color } : {}) });
          results.push({ op: op.op, noteId: note.id, title: firstLine(note.body) });
        } else if (op.op === "sticky_edit") {
          const note = await notes.update(ctx.teamId, ctx.memberId, op.note, { ...(op.body !== undefined ? { body: op.body } : {}), ...(op.color ? { color: op.color } : {}) });
          results.push({ op: op.op, noteId: note.id, title: firstLine(note.body) });
        } else {
          const before = (await notes.list(ctx.teamId, ctx.memberId)).find(n => n.id === op.note);
          await notes.remove(ctx.teamId, ctx.memberId, op.note);
          results.push({ op: op.op, noteId: op.note, title: firstLine(before?.body ?? "") });
        }
      }
    } catch (e) {
      // Same shape as notebook errors, so the card shows the reason.
      if (e instanceof StickyError) throw new NotebookError(e.message, e.status);
      throw e;
    }
    return results;
  }));
}
