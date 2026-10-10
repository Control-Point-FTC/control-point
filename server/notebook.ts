/** Team notebook access boundary. Human and Bruno reads share these guards.
 * A write transaction covers authorization, ancestry checks and mutations so
 * protection changes cannot race a save, move or export. No password grants.
 */
import type { Client, Transaction } from "@libsql/client";
import { dbClient } from "../db.js";
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { notebookDocumentJSON, seedNotebookDocument } from './notebookDocument.js';
import { seedCanvas, validatedCanvas } from '../src/notebook/canvasModel.js';
import { notebookPageReferences } from '../src/notebook/pageLinks.js';
import { notebookThreads, notebookThreadComments, notebookComment, notebookEditComment, notebookResolveThread, notebookMentionMembers, notebookMentionInbox, notebookReadMention } from './notebookDiscussions.js';
import { authorizeNotebookUpload, registerNotebookFile, indexNotebookFiles, notebookFileForPage } from './notebookFiles.js';
import {notebookTrash} from './notebookTrash.js';
import {notebookRestore} from './notebookRecovery.js';

export class NotebookError extends Error {
  constructor(message: string, readonly status = 400, readonly extra: Record<string, unknown> = {}) { super(message); }
}
export type NotebookContext = { memberId: number; teamId: number; source?: "human" | "bruno" };
type Kind = "notebook" | "section" | "page";
type Row = Record<string, any>;
type Access = { admin: boolean; permissions: Set<string>; human: boolean };
const tables = { notebook: "notebook_books", section: "notebook_sections", page: "notebook_pages" };
const MAX_PAGES = 20_000;
const MAX_DEPTH = 6;
// Embedded SQLite transactions share one connection pool. Queue notebook
// operations per client so a second BEGIN cannot block the first one's commit
// on the same JS event loop. Other server processes still need bounded retries.
const queues = new WeakMap<Client, Promise<void>>();
type Presence = { memberId: number; clientId: number; cursor: unknown; seen: number; epoch: string };
const presence = new WeakMap<Client, Map<string, Map<number, Presence>>>();
const notFound = () => new NotebookError("Notebook item unavailable", 404);
function id(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new NotebookError("Invalid item ID");
  return n;
}
function title(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) throw new NotebookError("Use a title between 1 and 200 characters");
  return value.trim();
}
function color(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new NotebookError("Invalid color");
  return value.toLowerCase();
}
function document(value: unknown, fallback: unknown, limit: number): string {
  value = value ?? fallback;
  if (typeof value !== "object") throw new NotebookError("Invalid document");
  let json: string;
  try { json = JSON.stringify(value); } catch { throw new NotebookError("Invalid document"); }
  if (Buffer.byteLength(json, "utf8") > limit) throw new NotebookError("Document too large", 413);
  return json;
}
/** Extract only authored text, never attachment bytes, OCR or AI output. */
export function notebookText(value: unknown): string {
  const texts: string[] = [];
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== "object" || depth > 60) return;
    if (Array.isArray(v)) { for (const child of v) walk(child, depth + 1); return; }
    if (typeof v.text === "string") texts.push(v.text);
    for (const [key, child] of Object.entries(v)) if (key !== "text" && key !== "attachments") walk(child, depth + 1);
  };
  walk(value, 0);
  return texts.join(" ").slice(0, 200_000);
}
export class Session {
  constructor(readonly tx: Transaction, readonly ctx: NotebookContext, readonly access: Access) {}
  async all(sql: string, ...args: any[]): Promise<Row[]> { return (await this.tx.execute({ sql, args })).rows as Row[]; }
  async one(sql: string, ...args: any[]): Promise<Row | undefined> { return (await this.all(sql, ...args))[0]; }
  async run(sql: string, ...args: any[]) { return this.tx.execute({ sql, args }); }
  can(capability: string) { return this.access.admin || this.access.permissions.has(capability); }
  require(capability: string) {
    if (!this.access.human || !this.can(capability)) throw new NotebookError("Notebook permission required", 403);
  }
  async item(kind: Kind, itemId: number, includeDeleted = false): Promise<Row> {
    const row = await this.one(`SELECT * FROM ${tables[kind]} WHERE id = ? AND team_id = ?`, id(itemId), this.ctx.teamId);
    if (!row || (!includeDeleted && row.deleted_at)) throw notFound();
    if (kind === "section") {
      await this.item("notebook", row.notebook_id, includeDeleted);
      this.guard(row.protected);
    }
    if (kind === "page") {
      await this.item("section", row.section_id, includeDeleted);
      const seen = new Set<number>();
      let ancestor: Row | undefined = row;
      while (ancestor) {
        if (seen.has(ancestor.id) || seen.size >= MAX_DEPTH) throw notFound();
        seen.add(ancestor.id);
        if (!includeDeleted && ancestor.deleted_at) throw notFound();
        this.guard(ancestor.protected);
        if (!ancestor.parent_id) break;
        ancestor = await this.one("SELECT * FROM notebook_pages WHERE id = ? AND team_id = ? AND section_id = ?", ancestor.parent_id, this.ctx.teamId, row.section_id);
        if (!ancestor) throw notFound();
      }
    }
    return row;
  }
  guard(protectedItem: unknown) { if (protectedItem && !(this.access.human && this.access.admin)) throw notFound(); }
  async isProtected(page: Row): Promise<boolean> {
    const section = await this.item("section", page.section_id, true);
    const ancestors = await this.all(`WITH RECURSIVE a AS (
      SELECT id,parent_id,protected FROM notebook_pages WHERE id=? AND team_id=?
      UNION ALL SELECT p.id,p.parent_id,p.protected FROM notebook_pages p JOIN a ON p.id=a.parent_id WHERE p.team_id=?
    ) SELECT protected FROM a`, page.id, this.ctx.teamId, this.ctx.teamId);
    return !!section.protected || ancestors.some(p => p.protected);
  }
  async descendants(pageId: number): Promise<Row[]> {
    return this.all(`WITH RECURSIVE descendants AS (
      SELECT id,parent_id,section_id,protected,deleted_at FROM notebook_pages WHERE id=? AND team_id=?
      UNION ALL SELECT p.id,p.parent_id,p.section_id,p.protected,p.deleted_at FROM descendants d CROSS JOIN notebook_pages p ON p.parent_id=d.id WHERE p.team_id=?
    ) SELECT * FROM descendants`, pageId, this.ctx.teamId, this.ctx.teamId);
  }
  async activePageCount(): Promise<number> {
    const row = await this.one(`WITH RECURSIVE active AS (
      SELECT p.id FROM notebook_pages p JOIN notebook_sections s ON s.id=p.section_id
      JOIN notebook_books b ON b.id=s.notebook_id
      WHERE p.team_id=? AND s.team_id=? AND b.team_id=? AND p.parent_id IS NULL
        AND p.deleted_at IS NULL AND s.deleted_at IS NULL AND b.deleted_at IS NULL
      UNION ALL SELECT p.id FROM active a CROSS JOIN notebook_pages p ON p.parent_id=a.id
      WHERE p.team_id=? AND p.deleted_at IS NULL
    ) SELECT COUNT(*) AS n FROM active`, this.ctx.teamId, this.ctx.teamId, this.ctx.teamId, this.ctx.teamId);
    return Number(row?.n ?? 0);
  }
  async checkChildren(kind: Kind, row: Row) {
    if (this.access.human && this.access.admin) return;
    if (kind === "notebook") {
      const sections = await this.all("SELECT * FROM notebook_sections WHERE notebook_id=? AND team_id=?", row.id, this.ctx.teamId);
      for (const section of sections) { await this.item("section", section.id, true); await this.checkChildren("section", section); }
    } else {
      const pages = kind === "page" ? await this.descendants(row.id) : await this.all("SELECT id FROM notebook_pages WHERE section_id=? AND team_id=?", row.id, this.ctx.teamId);
      for (const page of pages) await this.item("page", page.id, true);
    }
  }
  async page(row: Row) {
    return { id: row.id, sectionId: row.section_id, parentId: row.parent_id, title: row.title, sort: row.position,
      protected: await this.isProtected(row), ownProtected: !!row.protected, content: JSON.parse(row.content), canvas: JSON.parse(row.canvas), revision: row.revision,
      createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  async tree() {
    const notebooks = await this.all("SELECT * FROM notebook_books WHERE team_id=? AND deleted_at IS NULL ORDER BY position,id", this.ctx.teamId);
    const sections = await this.all("SELECT * FROM notebook_sections WHERE team_id=? AND deleted_at IS NULL ORDER BY position,id", this.ctx.teamId);
    const pages = await this.all("SELECT id,section_id,parent_id,title,position,protected,revision,updated_at FROM notebook_pages WHERE team_id=? AND deleted_at IS NULL ORDER BY position,id", this.ctx.teamId);
    const bookIds = new Set(notebooks.map(b => b.id));
    const visibleSections = sections.filter(s => bookIds.has(s.notebook_id) && (!s.protected || (this.access.human && this.access.admin)));
    const sectionMap = new Map(visibleSections.map(s => [s.id, s]));
    const pageMap = new Map(pages.map(p => [p.id, p]));
    const visibility = new Map<number, { visible: boolean; protected: boolean }>();
    const inspect = (p: Row, path = new Set<number>()): { visible: boolean; protected: boolean } => {
      const cached = visibility.get(p.id);
      if (cached) return cached;
      const section = sectionMap.get(p.section_id);
      if (!section || path.has(p.id) || path.size >= MAX_DEPTH) return { visible: false, protected: true };
      const chain = new Set(path).add(p.id);
      const parent = p.parent_id ? pageMap.get(p.parent_id) : undefined;
      const inherited = parent && parent.section_id === p.section_id ? inspect(parent, chain) : { visible: !p.parent_id, protected: false };
      const protectedPage = !!(p.protected || section.protected || inherited.protected);
      const state = { visible: inherited.visible && (!protectedPage || (this.access.human && this.access.admin)), protected: protectedPage };
      visibility.set(p.id, state);
      return state;
    };
    const visiblePages = pages.filter(p => inspect(p).visible);
    return {
      notebooks: notebooks.map(n => ({ id: n.id, title: n.title, color: n.color, sort: n.position })),
      sections: visibleSections.map(s => ({ id: s.id, notebookId: s.notebook_id, title: s.title, color: s.color, sort: s.position, protected: !!s.protected })),
      pages: visiblePages.map(p => ({ id: p.id, sectionId: p.section_id, parentId: p.parent_id, title: p.title, sort: p.position, protected: inspect(p).protected, ownProtected: !!p.protected, revision: p.revision, updatedAt: p.updated_at })),
      permissions: { read: true, edit: this.access.human && this.can("edit_notebook"), organize: this.access.human && this.can("organize_notebook"), delete: this.access.human && this.can("delete_notebook"), protect: this.access.human && this.access.admin },
    };
  }
  async snapshot(row: Row) {
    // Tree operations pass structural rows without the authored document.
    // Load the complete revision inside the same transaction before indexing it.
    row = await this.one('SELECT * FROM notebook_pages WHERE id=? AND team_id=?', row.id, this.ctx.teamId);
    await this.run(`INSERT OR IGNORE INTO notebook_versions(team_id,page_id,title,content,canvas,revision,author_id,saved_at)
      SELECT team_id,id,title,content,canvas,revision,updated_by,updated_at FROM notebook_pages WHERE id=? AND team_id=?`, row.id, this.ctx.teamId);
    await this.run("DELETE FROM notebook_versions WHERE page_id=? AND team_id=? AND id NOT IN (SELECT id FROM notebook_versions WHERE page_id=? AND team_id=? ORDER BY revision DESC LIMIT 50)", row.id, this.ctx.teamId, row.id, this.ctx.teamId);
    await indexNotebookFiles(this,row.id,JSON.parse(row.content),JSON.parse(row.canvas),row.revision,true);
    await this.run('DELETE FROM notebook_file_refs WHERE team_id=? AND page_id=? AND revision!=0 AND revision NOT IN (SELECT revision FROM notebook_versions WHERE team_id=? AND page_id=?)',this.ctx.teamId,row.id,this.ctx.teamId,row.id);
  }
  async indexLinks(pageId: number, content: unknown, canvas: unknown = {}) {
    await this.run('DELETE FROM notebook_links WHERE team_id=? AND source_page_id=?', this.ctx.teamId, pageId);
    const textBoxes = (canvas as any)?.version === 1 && Array.isArray((canvas as any).objects) ? (canvas as any).objects.filter((item: any) => item.type === 'text').map((item: any) => item.content) : [];
    for (const link of notebookPageReferences([content, ...textBoxes])) await this.run('INSERT INTO notebook_links(team_id,source_page_id,target_page_id,target_block_id) VALUES(?,?,?,?)', this.ctx.teamId, pageId, link.pageId, link.blockId);
  }
  async save(pageId: number, body: Row, trustedHistory = false) {
    this.require("edit_notebook");
    const row = await this.item("page", pageId);
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision !== row.revision) throw new NotebookError("Page changed; review the latest revision", 409, { page: await this.page(row) });
    const nextTitle = body.title === undefined ? row.title : title(body.title);
    const content = body.content === undefined ? row.content : document(body.content, [], 2_000_000);
    if (body.canvas !== undefined && !trustedHistory) {
      try { validatedCanvas(body.canvas); } catch (e) { throw new NotebookError((e as Error).message,422); }
    }
    const canvas = body.canvas === undefined ? row.canvas : document(body.canvas, {}, 4_000_000);
    await this.snapshot(row);
    await this.run("UPDATE notebook_pages SET title=?,content=?,canvas=?,plain=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND team_id=? AND revision=?",
      nextTitle, content, canvas, notebookText(JSON.parse(content)) + " " + notebookText(JSON.parse(canvas)), this.ctx.memberId, new Date().toISOString(), row.id, this.ctx.teamId, row.revision);
    // The revision API replaces content instead of merging CRDT updates. Force
    // connected clients to recover before sending their former generation.
    if (body.content === undefined && body.canvas === undefined && row.crdt_state) {
      const shared = new Y.Doc();
      try {
        Y.applyUpdate(shared, new Uint8Array(row.crdt_state));
        shared.getMap('meta').set('title', nextTitle);
        await this.run('UPDATE notebook_pages SET crdt_state=? WHERE id=? AND team_id=?', Y.encodeStateAsUpdate(shared), row.id, this.ctx.teamId);
      } finally { shared.destroy(); }
    } else await this.run('UPDATE notebook_pages SET crdt_state=NULL,crdt_epoch=? WHERE id=? AND team_id=?', randomUUID(), row.id, this.ctx.teamId);
    if (body.content !== undefined || body.canvas !== undefined) await this.indexLinks(row.id, JSON.parse(content), JSON.parse(canvas));
    await indexNotebookFiles(this,row.id,JSON.parse(content),JSON.parse(canvas));
    return this.page(await this.item("page", row.id));
  }
}

export class NotebookStore {
  constructor(private readonly client: Client = dbClient) {}
  authorizeFileUpload(ctx: NotebookContext, pageId: number) { return this.session(ctx,s=>authorizeNotebookUpload(s,pageId)); }
  registerFile(ctx: NotebookContext, pageId: number, fileId: number) { return this.session(ctx,s=>registerNotebookFile(s,pageId,id(fileId))); }
  fileForPage(ctx: NotebookContext, pageId: number, fileId: number) { return this.session(ctx,s=>notebookFileForPage(s,pageId,id(fileId))); }
  private async session<T>(ctx: NotebookContext, fn: (s: Session) => Promise<T>): Promise<T> {
    const prior = queues.get(this.client) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>(resolve => { release = resolve; });
    const queued = prior.then(() => done);
    queues.set(this.client, queued);
    await prior;
    try { return await this.transaction(ctx, fn); }
    finally { release(); if (queues.get(this.client) === queued) queues.delete(this.client); }
  }
  private async transaction<T>(ctx: NotebookContext, fn: (s: Session) => Promise<T>): Promise<T> {
    let tx: Transaction | undefined;
    for (let attempt = 0; ; attempt++) {
      try { tx = await this.client.transaction("write"); break; }
      catch (e) {
        if ((e as any)?.code !== "SQLITE_BUSY" || attempt >= 4) throw e;
        await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
      }
    }
    try {
      const member = (await tx.execute({ sql: "SELECT account_type FROM members WHERE id=? AND team_id=? AND COALESCE(is_active,1)=1", args: [id(ctx.memberId), id(ctx.teamId)] })).rows[0];
      if (!member) throw new NotebookError("Active team membership required", 403);
      const roles = (await tx.execute({ sql: "SELECT r.permissions FROM roles r JOIN member_roles mr ON mr.role_id=r.id WHERE mr.member_id=? AND r.team_id=?", args: [ctx.memberId, ctx.teamId] })).rows;
      const permissions = new Set<string>();
      for (const role of roles) { try { const p = JSON.parse(String(role.permissions)); if (Array.isArray(p)) for (const key of p) if (typeof key === "string") permissions.add(key); } catch { /* malformed role grants nothing */ } }
      const admin = member.account_type === "admin" || permissions.has("*") || permissions.has("manage_members");
      const result = await fn(new Session(tx, ctx, { admin, permissions, human: ctx.source !== "bruno" }));
      await tx.commit();
      return result;
    } catch (e) { await tx.rollback(); throw e; } finally { tx.close(); }
  }
  tree(ctx: NotebookContext) { return this.session(ctx, async s => {
    // Starter uniqueness holds even when two devices first open simultaneously.
    // A deleted starter is not recreated: an intentionally empty team stays empty.
    if (!await s.one("SELECT id FROM notebook_books WHERE team_id=?", ctx.teamId) && s.access.human && s.can("organize_notebook")) {
      const now = new Date().toISOString();
      const book = await s.run("INSERT INTO notebook_books(team_id,title,starter,created_by,created_at) VALUES(?, 'Team notebook',1,?,?)", ctx.teamId, ctx.memberId, now);
      await s.run("INSERT INTO notebook_sections(team_id,notebook_id,title,created_by,created_at) VALUES(?,?,'Quick notes',?,?)", ctx.teamId, Number(book.lastInsertRowid), ctx.memberId, now);
    }
    return s.tree();
  }); }
  page(ctx: NotebookContext, pageId: number) { return this.session(ctx, async s => s.page(await s.item("page", pageId))); }
  threads(ctx: NotebookContext, pageId: number, before?: unknown, focus?: unknown) { return this.session(ctx, s => notebookThreads(s, pageId, before, focus)); }
  threadComments(ctx: NotebookContext, pageId: number, threadId: number, before?: unknown, limit?: unknown) { return this.session(ctx, s => notebookThreadComments(s, pageId, threadId, before, limit)); }
  comment(ctx: NotebookContext, pageId: number, body: Row) { return this.session(ctx, s => notebookComment(s, pageId, body)); }
  editComment(ctx: NotebookContext, pageId: number, commentId: number, body: Row, remove = false) { return this.session(ctx, s => notebookEditComment(s, pageId, commentId, body, remove)); }
  resolveThread(ctx: NotebookContext, pageId: number, threadId: number, resolved: unknown) { return this.session(ctx, s => notebookResolveThread(s, pageId, threadId, resolved)); }
  mentionMembers(ctx: NotebookContext, pageId: number) { return this.session(ctx, s => notebookMentionMembers(s, pageId)); }
  mentionInbox(ctx: NotebookContext) { return this.session(ctx, s => notebookMentionInbox(s)); }
  readMention(ctx: NotebookContext, commentId: number) { return this.session(ctx, s => notebookReadMention(s, commentId)); }
  sync(ctx: NotebookContext, pageId: number, body: Row) { return this.session(ctx, async s => {
    if (!s.access.human) throw new NotebookError('Collaboration is available to team members only', 403);
    const row = await s.item('page', pageId);
    const decode = (value: unknown, limit: number) => {
      if (typeof value !== 'string' || value.length > Math.ceil(limit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new NotebookError('Invalid collaboration data');
      const bytes = Buffer.from(value, 'base64');
      if (bytes.length > limit) throw new NotebookError('Collaboration update too large', 413);
      return bytes;
    };
    const vector = body.vector === undefined ? undefined : decode(body.vector, 100_000);
    const update = body.update === undefined ? undefined : decode(body.update, 1_000_000);
    const epoch = row.crdt_epoch ?? randomUUID();
    if (body.epoch !== undefined && body.epoch !== epoch) throw new NotebookError('This page was restored or replaced. Recover your unsaved changes before rejoining.', 409, { epoch });
    if (update && body.epoch === undefined) throw new NotebookError('Join the document before sending changes', 409);
    if (update && !s.can('edit_notebook')) throw new NotebookError('Editing permission changed; your unsaved changes need recovery', 403, { readable: true });
    let doc: Y.Doc | undefined;
    const storedCanvas = JSON.parse(row.canvas);
    let legacyCanvas = false;
    try { validatedCanvas(storedCanvas); } catch { legacyCanvas = true; }
    const seed = legacyCanvas ? {} : storedCanvas;
    let seededCanvas = false;
    try {
      if (row.crdt_state) {
        doc = new Y.Doc();
        Y.applyUpdate(doc, new Uint8Array(row.crdt_state));
        if (!doc.share.has('canvas')) { seedCanvas(doc, seed); seededCanvas = true; }
      } else doc = seedNotebookDocument(JSON.parse(row.content), row.title, seed);
      const before = Y.encodeStateAsUpdate(doc);
      if (update) Y.applyUpdate(doc, update);
      const json = notebookDocumentJSON(doc);
      const content = document(json.content, [], 2_000_000);
      if (legacyCanvas && json.canvas.objects.length) throw new NotebookError('Export the retained legacy canvas before replacing its drawing format.',422);
      const canvas = legacyCanvas ? row.canvas : document(json.canvas, {}, 4_000_000);
      const nextTitle = title(json.title);
      const state = Y.encodeStateAsUpdate(doc);
      if (state.length > 6_000_000) throw new NotebookError('Shared document too large; copy it into a new page', 413);
      const changed = !Buffer.from(before).equals(Buffer.from(state));
      if (changed) {
        await s.snapshot(row);
        await s.run('UPDATE notebook_pages SET content=?,canvas=?,title=?,plain=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND team_id=?', content, canvas, nextTitle, notebookText(json.content) + ' ' + notebookText(JSON.parse(canvas)), ctx.memberId, new Date().toISOString(), row.id, ctx.teamId);
        await s.indexLinks(row.id, json.content, json.canvas);
        await indexNotebookFiles(s,row.id,json.content,json.canvas);
      }
      if (!row.crdt_state || seededCanvas || changed) await s.run('UPDATE notebook_pages SET crdt_state=?,crdt_epoch=? WHERE id=? AND team_id=?', state, epoch, row.id, ctx.teamId);
      if (!row.crdt_state && !changed) {
        // The one-time seed supplies stable IDs before any editor joins. These
        // representation fields are not an authored text change/revision.
        await s.run('UPDATE notebook_pages SET content=? WHERE id=? AND team_id=?', content, row.id, ctx.teamId);
        await s.indexLinks(row.id, json.content, json.canvas);
        await indexNotebookFiles(s,row.id,json.content,json.canvas);
      }
      const current = changed ? await s.item('page', pageId) : row;
      const protectedPage = await s.isProtected(row);
      const peers: Row[] = [];
      if (body.clientId !== undefined) {
        if (!Number.isInteger(body.clientId) || body.clientId < 0 || body.clientId > 0xffffffff) throw new NotebookError('Invalid collaborator identity');
        let cursor: unknown = null;
        if (body.cursor != null) {
          if (typeof body.cursor !== 'object' || JSON.stringify(body.cursor).length > 2000) throw new NotebookError('Invalid collaborator cursor');
          const parse = (p: any) => {
            if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['type','tname','item','assoc'].includes(k))) throw new NotebookError('Invalid collaborator cursor');
            for (const key of ['type', 'item']) if (p[key] != null) {
              const value = p[key];
              if (typeof value !== 'object' || Object.keys(value).some(k => !['client','clock'].includes(k)) || !Number.isInteger(value.client) || value.client < 0 || value.client > 0xffffffff || !Number.isSafeInteger(value.clock) || value.clock < 0) throw new NotebookError('Invalid collaborator cursor');
            }
            if ((p.tname != null && p.tname !== 'prosemirror') || (p.assoc != null && ![-1,0,1].includes(p.assoc))) throw new NotebookError('Invalid collaborator cursor');
            return Y.relativePositionToJSON(Y.createRelativePositionFromJSON(p));
          };
          cursor = { anchor: parse(body.cursor.anchor), head: parse(body.cursor.head) };
        }
        const rooms = presence.get(this.client) ?? new Map<string, Map<number, Presence>>();
        presence.set(this.client, rooms);
        const now = Date.now();
        for (const [key, room] of rooms) {
          for (const [clientId, peer] of room) if (now - peer.seen > 20_000) room.delete(clientId);
          if (!room.size) rooms.delete(key);
        }
        const key = `${ctx.teamId}:${pageId}`;
        const room = rooms.get(key) ?? new Map<number, Presence>();
        if (!rooms.has(key) && rooms.size >= 200) throw new NotebookError('Too many active collaboration rooms', 429);
        const prior = room.get(body.clientId);
        if (prior && prior.memberId !== ctx.memberId) throw new NotebookError('Collaborator identity collision; reopen this page', 409);
        if (!prior && room.size >= 64) throw new NotebookError('This page has reached its collaborator limit', 429);
        room.set(body.clientId, { memberId: ctx.memberId, clientId: body.clientId, cursor, seen: now, epoch });
        rooms.set(key, room);
        // Names and permissions come from current membership, never client
        // awareness payloads. A revoked admin must disappear from a protected
        // page before any viewer receives another cursor/presence response.
        const ids = [...new Set([...room.values()].map(p => p.memberId))];
        const members = await s.all(`SELECT id,name,account_type FROM members WHERE team_id=? AND COALESCE(is_active,1)=1 AND id IN (${ids.map(() => '?').join(',')})`, ctx.teamId, ...ids);
        const roles = protectedPage ? await s.all(`SELECT mr.member_id,r.permissions FROM roles r JOIN member_roles mr ON r.id=mr.role_id WHERE r.team_id=? AND mr.member_id IN (${ids.map(() => '?').join(',')})`, ctx.teamId, ...ids) : [];
        const admins = new Set(members.filter(m => m.account_type === 'admin').map(m => m.id));
        for (const role of roles) { try { const keys = JSON.parse(role.permissions); if (Array.isArray(keys) && (keys.includes('*') || keys.includes('manage_members'))) admins.add(role.member_id); } catch { /* malformed grants nothing */ } }
        for (const [clientId, peer] of room) {
          const member = members.find(m => m.id === peer.memberId);
          if (!member || peer.epoch !== epoch || (protectedPage && !admins.has(peer.memberId))) { room.delete(clientId); continue; }
          peers.push({ clientId, memberId: member.id, name: String(member.name).slice(0, 80), color: ['#3b82f6','#8b5cf6','#ec4899','#06b6d4','#22c55e','#f97316'][member.id % 6], cursor: peer.cursor, clock: peer.seen });
        }
      }
      return { epoch, update: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64'), vector: Buffer.from(Y.encodeStateVector(doc)).toString('base64'), revision: current.revision, title: nextTitle, protected: protectedPage, editable: s.can('edit_notebook'), updatedBy: current.updated_by, updatedAt: current.updated_at, createdAt: current.created_at, legacyCanvas: legacyCanvas ? storedCanvas : undefined, peers };
    } catch (e) {
      if (e instanceof NotebookError) throw e;
      throw new NotebookError(e instanceof Error ? e.message : 'Invalid collaboration document', 422);
    } finally { doc?.destroy(); }
  }); }
  create(ctx: NotebookContext, kind: Kind, body: Row) { return this.session(ctx, async s => {
    s.require(kind === "page" ? "edit_notebook" : "organize_notebook");
    const name = title(body.title);
    if (body.protected !== undefined && typeof body.protected !== "boolean") throw new NotebookError("Protection must be true or false");
    const now = new Date().toISOString();
    let result;
    if (kind === "notebook") {
      if (Number((await s.one("SELECT COUNT(*) AS n FROM notebook_books WHERE team_id=? AND deleted_at IS NULL", ctx.teamId))?.n) >= 200) throw new NotebookError("Notebook limit reached");
      result = await s.run("INSERT INTO notebook_books(team_id,title,color,position,created_by,created_at) VALUES(?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM notebook_books WHERE team_id=?),?,?)", ctx.teamId, name, color(body.color), ctx.teamId, ctx.memberId, now);
    } else if (kind === "section") {
      const book = await s.item("notebook", id(body.notebookId));
      if (Number((await s.one("SELECT COUNT(*) AS n FROM notebook_sections WHERE notebook_id=? AND deleted_at IS NULL", book.id))?.n) >= 500) throw new NotebookError("Section limit reached");
      if (body.protected && !s.access.admin) throw new NotebookError("Team admin required", 403);
      result = await s.run("INSERT INTO notebook_sections(team_id,notebook_id,title,color,protected,position,created_by,created_at) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM notebook_sections WHERE notebook_id=?),?,?)", ctx.teamId, book.id, name, color(body.color), body.protected ? 1 : 0, book.id, ctx.memberId, now);
    } else {
      const section = await s.item("section", id(body.sectionId));
      const parentId = body.parentId == null ? null : id(body.parentId);
      if (parentId) {
        const parent = await s.item("page", parentId);
        if (parent.section_id !== section.id) throw new NotebookError("Parent must belong to the section");
        let depth = 1, ancestor = parent;
        while (ancestor.parent_id) { ancestor = await s.item("page", ancestor.parent_id); depth++; }
        if (depth >= MAX_DEPTH) throw new NotebookError("Maximum page depth is six");
      }
      if (body.protected && !s.access.admin) throw new NotebookError("Team admin required", 403);
      if (await s.activePageCount() >= MAX_PAGES) throw new NotebookError("Page limit reached");
      try { validatedCanvas(body.canvas ?? {}); } catch (e) { throw new NotebookError((e as Error).message,422); }
      const content = document(body.content, [], 2_000_000), canvas = document(body.canvas, {}, 4_000_000);
      result = await s.run("INSERT INTO notebook_pages(team_id,section_id,parent_id,title,protected,content,canvas,plain,position,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM notebook_pages WHERE section_id=? AND parent_id IS ?),?,?,?,?)", ctx.teamId, section.id, parentId, name, body.protected ? 1 : 0, content, canvas, notebookText(JSON.parse(content)) + " " + notebookText(JSON.parse(canvas)), section.id, parentId, ctx.memberId, ctx.memberId, now, now);
    }
    const row = await s.item(kind, Number(result.lastInsertRowid));
    if (kind === 'page') {
      await s.indexLinks(row.id, JSON.parse(row.content), JSON.parse(row.canvas));
      await indexNotebookFiles(s,row.id,JSON.parse(row.content),JSON.parse(row.canvas));
    }
    return kind === "page" ? s.page(row) : { id: row.id, title: row.title, color: row.color, notebookId: row.notebook_id, protected: !!row.protected };
  }); }
  update(ctx: NotebookContext, kind: "notebook" | "section", itemId: number, body: Row) { return this.session(ctx, async s => {
    s.require("organize_notebook");
    const row = await s.item(kind, itemId);
    await s.run(`UPDATE ${tables[kind]} SET title=?,color=? WHERE id=? AND team_id=?`, body.title === undefined ? row.title : title(body.title), body.color === undefined ? row.color : color(body.color), row.id, ctx.teamId);
    return { ok: true };
  }); }
  save(ctx: NotebookContext, pageId: number, body: Row) { return this.session(ctx, s => s.save(pageId, body)); }
  protect(ctx: NotebookContext, kind: "section" | "page", itemId: number, value: unknown) { return this.session(ctx, async s => {
    if (!s.access.human || !s.access.admin) throw new NotebookError("Team admin required", 403);
    if (typeof value !== "boolean") throw new NotebookError("Protection must be true or false");
    const row = await s.item(kind, itemId);
    await s.run(`UPDATE ${tables[kind]} SET protected=? WHERE id=? AND team_id=?`, value ? 1 : 0, row.id, ctx.teamId);
    return { ok: true, protected: value };
  }); }
  remove(ctx: NotebookContext, kind: Kind, itemId: number) { return this.session(ctx, async s => {
    s.require("delete_notebook");
    const row = await s.item(kind, itemId);
    await s.checkChildren(kind, row);
    // Tombstone only the root. Descendants inherit deletion and retain ancestry
    // and protection for a later restore, instead of losing user content.
    await s.run(`UPDATE ${tables[kind]} SET deleted_at=?,deleted_by=? WHERE id=? AND team_id=?`, new Date().toISOString(), ctx.memberId, row.id, ctx.teamId);
    return { ok: true };
  }); }
  search(ctx: NotebookContext, query: string, limit = 30) { return this.session(ctx, async s => {
    if (query.length > 200) throw new NotebookError("Search is limited to 200 characters");
    if (!query.trim()) return [];
    const escaped = query.trim().replace(/[\\%_]/g, "\\$&");
    // Visibility filtering precedes the result limit: hidden matches never
    // displace permitted results or expose their titles/snippets.
    const permitted = new Set((await s.tree()).pages.map(p => p.id));
    if (!permitted.size) return [];
    const hits = [];
    const count = Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 30));
    let cursor: Row | undefined;
    while (hits.length < count) {
      const rows = await s.all(`SELECT id,section_id,title,plain,updated_at FROM notebook_pages INDEXED BY notebook_pages_search
        WHERE team_id=? AND deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR plain LIKE ? ESCAPE '\\')
        ${cursor ? "AND (updated_at,id) < (?,?)" : ""}
        ORDER BY updated_at DESC,id DESC LIMIT 50`, ctx.teamId, `%${escaped}%`, `%${escaped}%`, ...(cursor ? [cursor.updated_at, cursor.id] : []));
      if (!rows.length) break;
      for (const row of rows) {
        if (!permitted.has(row.id)) continue;
        const at = row.plain.toLowerCase().indexOf(query.trim().toLowerCase());
        hits.push({ id: row.id, sectionId: row.section_id, title: row.title, snippet: row.plain.slice(Math.max(0, at - 60), Math.max(0, at - 60) + 200) });
        if (hits.length >= count) break;
      }
      cursor = rows[rows.length - 1];
    }
    return hits;
  }); }
  trash(ctx:NotebookContext,cursor?:unknown){return this.session(ctx,s=>notebookTrash(s,cursor));}
  restore(ctx:NotebookContext,kind:Kind,itemId:number,to:Row={}){return this.session(ctx,s=>notebookRestore(s,kind,itemId,to));}
  versions(ctx: NotebookContext, pageId: number, versionId?: number) { return this.session(ctx, async s => {
    await s.item("page", pageId);
    if (versionId !== undefined) {
      const row = await s.one("SELECT v.*,m.name AS author_name FROM notebook_versions v LEFT JOIN members m ON m.id=v.author_id AND m.team_id=v.team_id WHERE v.id=? AND v.page_id=? AND v.team_id=?", id(versionId), pageId, ctx.teamId);
      if (!row) throw notFound();
      return { id: row.id, title: row.title, content: JSON.parse(row.content), canvas: JSON.parse(row.canvas), revision: row.revision, authorId: row.author_id, authorName: row.author_name ? String(row.author_name).slice(0,80) : 'Former team member', savedAt: row.saved_at };
    }
    return (await s.all("SELECT v.id,v.revision,v.author_id,v.saved_at,m.name AS author_name FROM notebook_versions v LEFT JOIN members m ON m.id=v.author_id AND m.team_id=v.team_id WHERE v.page_id=? AND v.team_id=? ORDER BY v.revision DESC", pageId, ctx.teamId)).map(v => ({ id: v.id, revision: v.revision, authorId: v.author_id, authorName: v.author_name ? String(v.author_name).slice(0,80) : 'Former team member', savedAt: v.saved_at }));
  }); }
  restoreVersion(ctx: NotebookContext, pageId: number, versionId: number, baseRevision: number) { return this.session(ctx, async s => {
    await s.item("page", pageId);
    const version = await s.one("SELECT * FROM notebook_versions WHERE id=? AND page_id=? AND team_id=?", id(versionId), pageId, ctx.teamId);
    if (!version) throw notFound();
    return s.save(pageId, { baseRevision, title: version.title, content: JSON.parse(version.content), canvas: JSON.parse(version.canvas) }, true);
  }); }
  duplicate(ctx: NotebookContext, pageId: number) { return this.session(ctx, async s => {
    s.require("edit_notebook");
    const row = await s.item("page", pageId);
    if (await s.activePageCount() >= MAX_PAGES) throw new NotebookError("Page limit reached");
    const now = new Date().toISOString();
    const copy = await s.run("INSERT INTO notebook_pages(team_id,section_id,parent_id,title,protected,content,canvas,plain,position,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM notebook_pages WHERE section_id=? AND parent_id IS ?),?,?,?,?)",
      ctx.teamId, row.section_id, row.parent_id, row.title.slice(0, 193) + " (copy)", await s.isProtected(row) ? 1 : 0, row.content, row.canvas, row.plain, row.section_id, row.parent_id, ctx.memberId, ctx.memberId, now, now);
    await s.indexLinks(Number(copy.lastInsertRowid), JSON.parse(row.content), JSON.parse(row.canvas));
    await indexNotebookFiles(s,Number(copy.lastInsertRowid),JSON.parse(row.content),JSON.parse(row.canvas),0,true);
    return s.page(await s.item("page", Number(copy.lastInsertRowid)));
  }); }
  backlinks(ctx: NotebookContext, pageId: number) { return this.session(ctx, async s => {
    await s.item('page', pageId);
    const tree = await s.tree();
    const references = await s.all('SELECT source_page_id,target_block_id FROM notebook_links WHERE team_id=? AND target_page_id=?', ctx.teamId, pageId);
    const visible = new Map(tree.pages.map(p => [p.id, p]));
    return references.filter(r => visible.has(r.source_page_id)).slice(0, 200).map(r => ({ ...visible.get(r.source_page_id), targetBlockId: r.target_block_id }));
  }); }
  move(ctx: NotebookContext, kind: Kind, itemId: number, to: Row, index: unknown) { return this.session(ctx, async s => {
    s.require("organize_notebook");
    const row = await s.item(kind, itemId);
    await s.checkChildren(kind, row);
    const n = Number(index);
    if (!Number.isSafeInteger(n) || n < 0) throw new NotebookError("Invalid position");
    let siblingWhere = "team_id=? AND deleted_at IS NULL";
    let siblingArgs: any[] = [ctx.teamId];
    if (kind === "section") {
      const notebookId = to.notebookId === undefined ? row.notebook_id : id(to.notebookId);
      await s.item("notebook", notebookId);
      await s.run("UPDATE notebook_sections SET notebook_id=? WHERE id=? AND team_id=?", notebookId, row.id, ctx.teamId);
      siblingWhere += " AND notebook_id=?";
      siblingArgs.push(notebookId);
    } else if (kind === "page") {
      const sectionId = to.sectionId === undefined ? row.section_id : id(to.sectionId);
      const parentId = to.parentId === undefined ? (sectionId === row.section_id ? row.parent_id : null) : to.parentId === null ? null : id(to.parentId);
      await s.item("section", sectionId);
      const descendants = await s.descendants(row.id);
      if (descendants.some(p => p.id === parentId)) throw new NotebookError("A page cannot be nested inside itself or its descendants");
      let parentDepth = 0;
      if (parentId) {
        let parent = await s.item("page", parentId);
        if (parent.section_id !== sectionId) throw new NotebookError("Parent must belong to the section");
        parentDepth = 1;
        while (parent.parent_id) { parent = await s.item("page", parent.parent_id); parentDepth++; }
      }
      const depth = new Map<number, number>([[row.id, 1]]);
      // The recursive query is parent-first. Deleted children still count:
      // restoring one must not produce an invalid depth later.
      for (const child of descendants) if (child.id !== row.id) depth.set(child.id, (depth.get(child.parent_id) ?? MAX_DEPTH) + 1);
      if (parentDepth + Math.max(...depth.values()) > MAX_DEPTH) throw new NotebookError("Maximum page depth is six");
      const keepProtected = await s.isProtected(row);
      for (const child of descendants) {
        await s.snapshot(child);
        // Moving changes structure, not the author of the saved text/canvas.
        await s.run("UPDATE notebook_pages SET section_id=?,revision=revision+1,updated_at=? WHERE id=? AND team_id=?", sectionId, new Date().toISOString(), child.id, ctx.teamId);
      }
      await s.run("UPDATE notebook_pages SET parent_id=?,protected=? WHERE id=? AND team_id=?", parentId, keepProtected ? 1 : 0, row.id, ctx.teamId);
      siblingWhere += " AND section_id=? AND parent_id IS ?";
      siblingArgs.push(sectionId, parentId);
    }
    const siblings = (await s.all(`SELECT id FROM ${tables[kind]} WHERE ${siblingWhere} AND id!=? ORDER BY position,id`, ...siblingArgs, row.id)).map(r => r.id);
    siblings.splice(Math.min(n, siblings.length), 0, row.id);
    for (let i = 0; i < siblings.length; i++) await s.run(`UPDATE ${tables[kind]} SET position=? WHERE id=? AND team_id=?`, i, siblings[i], ctx.teamId);
    return s.tree();
  }); }
  export(ctx: NotebookContext) { return this.session(ctx, async s => {
    const tree = await s.tree();
    const pages = [];
    let bytes = Buffer.byteLength(JSON.stringify(tree), "utf8");
    for (const page of tree.pages) {
      const row = await s.item("page", page.id);
      bytes += Buffer.byteLength(row.content, "utf8") + Buffer.byteLength(row.canvas, "utf8");
      if (bytes > 10_000_000) throw new NotebookError("Notebook export is too large for a single response", 413);
      pages.push(await s.page(row));
    }
    return { ...tree, pages };
  }); }
}

type NotebookDeps = { requireAuth: (req: any, res: any) => Promise<{ memberId: number; teamId: number | null } | null>; ensureRolesSeeded: (teamId: number) => Promise<void> };
export function registerNotebookRoutes(app: any, deps: NotebookDeps, store = new NotebookStore()) {
  const initializing = new Map<number, Promise<void>>();
  const initializeRoles = async (teamId: number) => {
    let pending = initializing.get(teamId);
    if (!pending) {
      pending = deps.ensureRolesSeeded(teamId);
      initializing.set(teamId, pending);
    }
    try { await pending; } finally { if (initializing.get(teamId) === pending) initializing.delete(teamId); }
  };
  const handle = (fn: (ctx: NotebookContext, req: any) => Promise<unknown>) => async (req: any, res: any) => {
    // Protected response bodies must not persist in browser/shared HTTP caches.
    res.setHeader("Cache-Control", "no-store");
    const auth = await deps.requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.status(403).json({ error: "Select an active team" });
    try {
      if (req.headers['x-cp-notebook-team'] !== undefined && Number(req.headers['x-cp-notebook-team']) !== auth.teamId) throw new NotebookError('Workspace changed; reopen this notebook in its workspace', 409, { workspaceChanged: true });
      await initializeRoles(auth.teamId);
      // Client input can never select a principal or grant admin access.
      const result = await fn({ memberId: auth.memberId, teamId: auth.teamId, source: "human" }, req);
      res.json(result);
    } catch (e) {
      if (e instanceof NotebookError) return res.status(e.status).json({ error: e.message, ...e.extra });
      console.error("notebook request failed", e);
      res.status(500).json({ error: "Notebook request failed" });
    }
  };
  app.get("/api/notebook/tree", handle(ctx => store.tree(ctx)));
  app.get('/api/notebook/trash',handle((ctx,req)=>store.trash(ctx,req.query.cursor)));
  app.get("/api/notebook/search", handle((ctx, req) => store.search(ctx, String(req.query.q ?? ""), Number(req.query.limit ?? 30))));
  app.get("/api/notebook/export", handle(ctx => store.export(ctx)));
  app.get('/api/notebook/mentions', handle(ctx => store.mentionInbox(ctx)));
  app.put('/api/notebook/mentions/:id/read', handle((ctx, req) => store.readMention(ctx, id(req.params.id))));
  for (const [plural, kind] of [["notebooks", "notebook"], ["sections", "section"], ["pages", "page"]] as const) {
    app.post(`/api/notebook/${plural}`, handle((ctx, req) => store.create(ctx, kind, req.body ?? {})));
    app.delete(`/api/notebook/${plural}/:id`, handle((ctx, req) => store.remove(ctx, kind, id(req.params.id))));
    app.post(`/api/notebook/${plural}/:id/restore`,handle((ctx,req)=>store.restore(ctx,kind,id(req.params.id),req.body?.destination??{})));
    if (kind !== "page") app.patch(`/api/notebook/${plural}/:id`, handle((ctx, req) => store.update(ctx, kind, id(req.params.id), req.body ?? {})));
    if (kind !== "notebook") app.put(`/api/notebook/${plural}/:id/protection`, handle((ctx, req) => store.protect(ctx, kind, id(req.params.id), req.body?.protected)));
  }
  app.get("/api/notebook/pages/:id", handle((ctx, req) => store.page(ctx, id(req.params.id))));
  app.post('/api/notebook/pages/:id/sync', handle((ctx, req) => store.sync(ctx, id(req.params.id), req.body ?? {})));
  app.get('/api/notebook/pages/:id/backlinks', handle((ctx, req) => store.backlinks(ctx, id(req.params.id))));
  app.get('/api/notebook/pages/:id/threads', handle((ctx, req) => store.threads(ctx, id(req.params.id), req.query.before, req.query.thread)));
  app.get('/api/notebook/pages/:id/threads/:tid/comments', handle((ctx, req) => store.threadComments(ctx, id(req.params.id), id(req.params.tid), req.query.before, req.query.limit)));
  app.post('/api/notebook/pages/:id/comments', handle((ctx, req) => store.comment(ctx, id(req.params.id), req.body ?? {})));
  app.patch('/api/notebook/pages/:id/comments/:cid', handle((ctx, req) => store.editComment(ctx, id(req.params.id), id(req.params.cid), req.body ?? {})));
  app.delete('/api/notebook/pages/:id/comments/:cid', handle((ctx, req) => store.editComment(ctx, id(req.params.id), id(req.params.cid), {}, true)));
  app.put('/api/notebook/pages/:id/threads/:tid/resolved', handle((ctx, req) => store.resolveThread(ctx, id(req.params.id), id(req.params.tid), req.body?.resolved)));
  app.get('/api/notebook/pages/:id/mention-members', handle((ctx, req) => store.mentionMembers(ctx, id(req.params.id))));
  app.put("/api/notebook/pages/:id", handle((ctx, req) => store.save(ctx, id(req.params.id), req.body ?? {})));
  app.post("/api/notebook/pages/:id/duplicate", handle((ctx, req) => store.duplicate(ctx, id(req.params.id))));
  app.post("/api/notebook/move", handle((ctx, req) => {
    const kind = req.body?.kind;
    if (kind !== "notebook" && kind !== "section" && kind !== "page") throw new NotebookError("Invalid item kind");
    return store.move(ctx, kind, id(req.body.id), req.body.to ?? {}, req.body.index ?? 0);
  }));
  app.get("/api/notebook/pages/:id/versions", handle((ctx, req) => store.versions(ctx, id(req.params.id))));
  app.get("/api/notebook/pages/:id/versions/:vid", handle((ctx, req) => store.versions(ctx, id(req.params.id), id(req.params.vid))));
  app.post("/api/notebook/pages/:id/versions/:vid/restore", handle((ctx, req) => store.restoreVersion(ctx, id(req.params.id), id(req.params.vid), req.body?.baseRevision)));
}
