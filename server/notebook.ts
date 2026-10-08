/**
 * Personal notebook (V3.5): private to one account.
 *
 *   notebooks → colour-coded sections → pages → subpages
 *
 * Every row carries `owner` = the account's lower-cased email, and every
 * query is scoped by it: teammates, workspace admins and the app owner never
 * see another person's notebook. A section can be locked with a password; a
 * locked section's pages stay out of the tree, search, history and Bruno
 * until it's unlocked on this sign-in (the unlock lasts 30 minutes).
 *
 * Pages hold their block content (BlockNote JSON), their freeform canvas
 * (text boxes, images, ink) and a plain-text copy for search, all set here
 * from what was saved. Each save may snapshot the previous state into the
 * page history (at most one snapshot per 10 minutes, newest 50 kept).
 *
 * NotebookStore is shared by the HTTP routes and Bruno's notebook tools.
 */
import bcrypt from "bcryptjs";
import { dbAll, dbBatch, dbGet, dbRun } from "../db.js";
import { RateLimiter } from "./rateLimit.js";

export const LIMITS = {
  title: 200,
  /** Serialised block content. */
  content: 2_000_000,
  /** Serialised canvas: ink strokes add up. */
  canvas: 4_000_000,
  notebooks: 200,
  sectionsPerNotebook: 500,
  pagesPerAccount: 20_000,
  versionsPerPage: 50,
  depth: 6,
};
/** A snapshot is taken at most this often while a page is being edited. */
export const VERSION_EVERY_MS = 10 * 60 * 1000;
export const UNLOCK_MS = 30 * 60 * 1000;
const COLOR = /^#[0-9a-f]{6}$/i;

export class NotebookError extends Error {
  constructor(message: string, readonly status: number, readonly extra: Record<string, unknown> = {}) { super(message); }
}
const notFound = () => new NotebookError("Not found", 404);
const lockedError = (sectionId: number) => new NotebookError("This section is locked", 423, { locked: true, sectionId });

export const ownerKey = (email: string | null | undefined) => String(email || "").trim().toLowerCase();

const now = () => new Date().toISOString();
const cleanTitle = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LIMITS.title) : "";
  return s || fallback;
};
const cleanColor = (v: unknown): string | null => (typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : null);

/**
 * Plain text for search: the title (a plain string), then every string under a "text" key, in order (BlockNote
 * inline content and table cells use it; canvas text boxes do too). Ink and
 * other data have no "text" keys, so they stay out.
 */
export function plainText(...docs: unknown[]): string {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 60 || v == null) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v !== "object") return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "text" && typeof x === "string") out.push(x);
      else if (typeof x === "object") walk(x, depth + 1);
    }
  };
  for (const d of docs) { if (typeof d === "string") out.push(d); else walk(d, 0); }
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, 200_000);
}

/** Parse + size-check a JSON document sent by the client (array or object). */
function cleanDoc(v: unknown, max: number, what: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") throw new NotebookError(`Invalid ${what}`, 400);
  const s = JSON.stringify(v);
  if (s.length > max) throw new NotebookError(`This page's ${what} is too large`, 413);
  return s;
}
const parseDoc = (s: unknown) => { if (typeof s !== "string" || !s) return null; try { return JSON.parse(s); } catch { return null; } };

export interface TreeNotebook { id: number; title: string; color: string | null; sort: number }
export interface TreeSection { id: number; notebookId: number; title: string; color: string | null; sort: number; locked: boolean; unlocked: boolean }
export interface TreePage { id: number; sectionId: number; parentId: number | null; title: string; sort: number; updatedAt: string }
export interface Page extends TreePage { content: unknown; canvas: unknown; createdAt: string }

/** Who's asking: the account, and the sections this sign-in has unlocked. */
export interface NbCtx { owner: string; unlocked: (sectionId: number) => boolean }

/** Unlock grants live in memory, per sign-in and section. */
export class UnlockGrants {
  private grants = new Map<string, number>();
  constructor(private clock: () => number = Date.now) {}
  private key = (session: string, sectionId: number) => `${session}|${sectionId}`;
  grant(session: string, sectionId: number) { this.grants.set(this.key(session, sectionId), this.clock() + UNLOCK_MS); }
  has(session: string | null, sectionId: number) {
    if (!session) return false;
    const k = this.key(session, sectionId);
    const until = this.grants.get(k);
    if (!until) return false;
    if (until <= this.clock()) { this.grants.delete(k); return false; }
    return true;
  }
  revoke(session: string, sectionId: number) { this.grants.delete(this.key(session, sectionId)); }
  /** A section's password changed or was removed: every unlock of it ends. */
  revokeSection(sectionId: number) { for (const k of this.grants.keys()) if (k.endsWith(`|${sectionId}`)) this.grants.delete(k); }
  sweep() { const t = this.clock(); for (const [k, v] of this.grants) if (v <= t) this.grants.delete(k); }
}

export class NotebookStore {
  // ---- reads ----

  async tree(ctx: NbCtx, { starter = true } = {}): Promise<{ notebooks: TreeNotebook[]; sections: TreeSection[]; pages: TreePage[] }> {
    if (starter) await this.ensureStarter(ctx.owner);
    const nbs = (await dbAll("SELECT id, title, color, sort FROM nb_notebooks WHERE owner = ? ORDER BY sort, id", ctx.owner)) as any[];
    const secs = (await dbAll("SELECT id, notebook_id, title, color, sort, password_hash FROM nb_sections WHERE owner = ? ORDER BY sort, id", ctx.owner)) as any[];
    const pages = (await dbAll("SELECT id, section_id, parent_id, title, sort, updated_at FROM nb_pages WHERE owner = ? ORDER BY sort, id", ctx.owner)) as any[];
    const sections: TreeSection[] = secs.map((s) => {
      const locked = !!s.password_hash;
      return { id: Number(s.id), notebookId: Number(s.notebook_id), title: s.title, color: s.color || null, sort: Number(s.sort), locked, unlocked: locked && ctx.unlocked(Number(s.id)) };
    });
    const hidden = new Set(sections.filter((s) => s.locked && !s.unlocked).map((s) => s.id));
    return {
      notebooks: nbs.map((n) => ({ id: Number(n.id), title: n.title, color: n.color || null, sort: Number(n.sort) })),
      sections,
      pages: pages.filter((p) => !hidden.has(Number(p.section_id))).map(toTreePage),
    };
  }

  /** A first visit gets a notebook and a section to write in. */
  private async ensureStarter(owner: string) {
    const has = (await dbGet("SELECT 1 AS x FROM nb_notebooks WHERE owner = ? LIMIT 1", owner)) as any;
    if (has) return;
    const t = now();
    const nb = await dbRun("INSERT INTO nb_notebooks (owner, title, color, sort, created_at, updated_at) VALUES (?, 'My notebook', '#c6f432', 0, ?, ?)", owner, t, t);
    await dbRun("INSERT INTO nb_sections (owner, notebook_id, title, color, sort, created_at, updated_at) VALUES (?, ?, 'Quick notes', '#38bdf8', 0, ?, ?)", owner, nb.lastInsertRowid, t, t);
  }

  async page(ctx: NbCtx, id: number): Promise<Page> {
    const row = (await dbGet("SELECT * FROM nb_pages WHERE id = ? AND owner = ?", id, ctx.owner)) as any;
    if (!row) throw notFound();
    await this.assertOpen(ctx, Number(row.section_id));
    return toPage(row);
  }

  async search(ctx: NbCtx, q: string, limit = 30): Promise<{ id: number; sectionId: number; title: string; snippet: string; updatedAt: string }[]> {
    const query = String(q || "").trim().slice(0, 200);
    if (!query) return [];
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = (await dbAll(
      `SELECT p.id, p.section_id, p.title, p.plain, p.updated_at, s.password_hash
         FROM nb_pages p JOIN nb_sections s ON s.id = p.section_id AND s.owner = p.owner
        WHERE p.owner = ? AND (p.title LIKE ? ESCAPE '\\' OR p.plain LIKE ? ESCAPE '\\')
        ORDER BY (p.title LIKE ? ESCAPE '\\') DESC, p.updated_at DESC LIMIT 200`,
      ctx.owner, like, like, like
    )) as any[];
    return rows
      .filter((r) => !r.password_hash || ctx.unlocked(Number(r.section_id)))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((r) => ({ id: Number(r.id), sectionId: Number(r.section_id), title: r.title, snippet: snippet(String(r.plain || ""), query), updatedAt: r.updated_at }));
  }

  async versions(ctx: NbCtx, pageId: number) {
    const page = await this.page(ctx, pageId);
    const rows = (await dbAll("SELECT id, title, created_at FROM nb_page_versions WHERE page_id = ? AND owner = ? ORDER BY id DESC", page.id, ctx.owner)) as any[];
    return rows.map((r) => ({ id: Number(r.id), title: r.title, createdAt: r.created_at }));
  }

  async version(ctx: NbCtx, pageId: number, versionId: number) {
    const page = await this.page(ctx, pageId);
    const v = (await dbGet("SELECT * FROM nb_page_versions WHERE id = ? AND page_id = ? AND owner = ?", versionId, page.id, ctx.owner)) as any;
    if (!v) throw notFound();
    return { id: Number(v.id), title: v.title, content: parseDoc(v.content), canvas: parseDoc(v.canvas), createdAt: v.created_at };
  }

  // ---- notebooks ----

  async createNotebook(ctx: NbCtx, body: any): Promise<TreeNotebook> {
    const n = (await dbGet("SELECT COUNT(*) AS n, COALESCE(MAX(sort), -1) AS top FROM nb_notebooks WHERE owner = ?", ctx.owner)) as any;
    if (Number(n?.n) >= LIMITS.notebooks) throw new NotebookError("You have too many notebooks", 400);
    const t = now();
    const title = cleanTitle(body?.title, "Untitled notebook");
    const color = cleanColor(body?.color);
    const sort = Number(n?.top ?? -1) + 1;
    const r = await dbRun("INSERT INTO nb_notebooks (owner, title, color, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", ctx.owner, title, color, sort, t, t);
    return { id: r.lastInsertRowid, title, color, sort };
  }

  async updateNotebook(ctx: NbCtx, id: number, body: any) {
    const nb = await this.ownNotebook(ctx, id);
    const title = body?.title !== undefined ? cleanTitle(body.title, nb.title) : nb.title;
    const color = body?.color !== undefined ? cleanColor(body.color) : nb.color;
    await dbRun("UPDATE nb_notebooks SET title = ?, color = ?, updated_at = ? WHERE id = ? AND owner = ?", title, color, now(), id, ctx.owner);
    return { id, title, color: color || null, sort: Number(nb.sort) };
  }

  /** Deletes the notebook and everything in it. Locked sections must be unlocked first. */
  async deleteNotebook(ctx: NbCtx, id: number) {
    await this.ownNotebook(ctx, id);
    const secs = (await dbAll("SELECT id, password_hash FROM nb_sections WHERE notebook_id = ? AND owner = ?", id, ctx.owner)) as any[];
    const locked = secs.find((s) => s.password_hash && !ctx.unlocked(Number(s.id)));
    if (locked) throw lockedError(Number(locked.id));
    await dbBatch([
      { sql: "DELETE FROM nb_page_versions WHERE owner = ? AND page_id IN (SELECT p.id FROM nb_pages p JOIN nb_sections s ON s.id = p.section_id WHERE s.notebook_id = ? AND p.owner = ?)", args: [ctx.owner, id, ctx.owner] },
      { sql: "DELETE FROM nb_pages WHERE owner = ? AND section_id IN (SELECT id FROM nb_sections WHERE notebook_id = ? AND owner = ?)", args: [ctx.owner, id, ctx.owner] },
      { sql: "DELETE FROM nb_sections WHERE notebook_id = ? AND owner = ?", args: [id, ctx.owner] },
      { sql: "DELETE FROM nb_notebooks WHERE id = ? AND owner = ?", args: [id, ctx.owner] },
    ]);
  }

  // ---- sections ----

  async createSection(ctx: NbCtx, body: any): Promise<TreeSection> {
    const notebookId = Number(body?.notebookId);
    await this.ownNotebook(ctx, notebookId);
    const n = (await dbGet("SELECT COUNT(*) AS n, COALESCE(MAX(sort), -1) AS top FROM nb_sections WHERE notebook_id = ? AND owner = ?", notebookId, ctx.owner)) as any;
    if (Number(n?.n) >= LIMITS.sectionsPerNotebook) throw new NotebookError("This notebook has too many sections", 400);
    const t = now();
    const title = cleanTitle(body?.title, "New section");
    const color = cleanColor(body?.color);
    const sort = Number(n?.top ?? -1) + 1;
    const r = await dbRun("INSERT INTO nb_sections (owner, notebook_id, title, color, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ctx.owner, notebookId, title, color, sort, t, t);
    return { id: r.lastInsertRowid, notebookId, title, color, sort, locked: false, unlocked: false };
  }

  async updateSection(ctx: NbCtx, id: number, body: any) {
    const s = await this.ownSection(ctx, id);
    const title = body?.title !== undefined ? cleanTitle(body.title, s.title) : s.title;
    const color = body?.color !== undefined ? cleanColor(body.color) : s.color;
    await dbRun("UPDATE nb_sections SET title = ?, color = ?, updated_at = ? WHERE id = ? AND owner = ?", title, color, now(), id, ctx.owner);
    const locked = !!s.password_hash;
    return { id, notebookId: Number(s.notebook_id), title, color: color || null, sort: Number(s.sort), locked, unlocked: locked && ctx.unlocked(id) };
  }

  async deleteSection(ctx: NbCtx, id: number) {
    await this.ownSection(ctx, id);
    await this.assertOpen(ctx, id);
    await dbBatch([
      { sql: "DELETE FROM nb_page_versions WHERE owner = ? AND page_id IN (SELECT id FROM nb_pages WHERE section_id = ? AND owner = ?)", args: [ctx.owner, id, ctx.owner] },
      { sql: "DELETE FROM nb_pages WHERE section_id = ? AND owner = ?", args: [id, ctx.owner] },
      { sql: "DELETE FROM nb_sections WHERE id = ? AND owner = ?", args: [id, ctx.owner] },
    ]);
  }

  /** Lock with a password, change it (needs the current one), or remove it (`password` null). */
  async setSectionPassword(ctx: NbCtx, id: number, current: unknown, next: unknown): Promise<void> {
    const s = await this.ownSection(ctx, id);
    if (s.password_hash && !(typeof current === "string" && bcrypt.compareSync(current, s.password_hash))) {
      throw new NotebookError("The current password is wrong", 403);
    }
    let hash: string | null = null;
    if (next !== null) {
      if (typeof next !== "string" || next.length < 4 || Buffer.byteLength(next) > 72) throw new NotebookError("Use a password of 4 to 72 characters", 400);
      hash = bcrypt.hashSync(next, 10);
    }
    await dbRun("UPDATE nb_sections SET password_hash = ?, updated_at = ? WHERE id = ? AND owner = ?", hash, now(), id, ctx.owner);
  }

  /** True when the password opens the section. */
  async checkSectionPassword(ctx: NbCtx, id: number, password: unknown): Promise<boolean> {
    const s = await this.ownSection(ctx, id);
    if (!s.password_hash) return true;
    return typeof password === "string" && bcrypt.compareSync(password, s.password_hash);
  }

  // ---- pages ----

  async createPage(ctx: NbCtx, body: any): Promise<Page> {
    const sectionId = Number(body?.sectionId);
    await this.ownSection(ctx, sectionId);
    await this.assertOpen(ctx, sectionId);
    const count = (await dbGet("SELECT COUNT(*) AS n FROM nb_pages WHERE owner = ?", ctx.owner)) as any;
    if (Number(count?.n) >= LIMITS.pagesPerAccount) throw new NotebookError("Your notebook is full", 400);
    const parentId: number | null = body?.parentId == null ? null : Number(body.parentId);
    if (parentId !== null) {
      const parent = (await dbGet("SELECT id, section_id FROM nb_pages WHERE id = ? AND owner = ?", parentId, ctx.owner)) as any;
      if (!parent || Number(parent.section_id) !== sectionId) throw new NotebookError("The parent page isn't in this section", 400);
      if ((await this.depthOf(ctx, parentId)) + 1 > LIMITS.depth) throw new NotebookError("Pages can only nest so deep", 400);
    }
    const content = cleanDoc(body?.content, LIMITS.content, "content");
    const canvas = cleanDoc(body?.canvas, LIMITS.canvas, "canvas");
    const title = cleanTitle(body?.title, "Untitled page");
    const top = (await dbGet(
      "SELECT COALESCE(MAX(sort), -1) AS top FROM nb_pages WHERE section_id = ? AND owner = ? AND parent_id IS ?", sectionId, ctx.owner, parentId
    )) as any;
    const t = now();
    const r = await dbRun(
      "INSERT INTO nb_pages (owner, section_id, parent_id, title, content, canvas, plain, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ctx.owner, sectionId, parentId, title, content, canvas, plainText(title, parseDoc(content), parseDoc(canvas)), Number(top?.top ?? -1) + 1, t, t
    );
    return this.page(ctx, r.lastInsertRowid);
  }

  /**
   * Save (auto-save) a page. `baseUpdatedAt`, when sent, must match the saved
   * page: otherwise another device saved in between (409 with the latest).
   */
  async savePage(ctx: NbCtx, id: number, body: any): Promise<Page> {
    const row = (await dbGet("SELECT * FROM nb_pages WHERE id = ? AND owner = ?", id, ctx.owner)) as any;
    if (!row) throw notFound();
    await this.assertOpen(ctx, Number(row.section_id));
    if (typeof body?.baseUpdatedAt === "string" && body.baseUpdatedAt !== row.updated_at) {
      throw new NotebookError("This page changed on another device", 409, { page: toPage(row) });
    }
    const title = body?.title !== undefined ? cleanTitle(body.title, "Untitled page") : row.title;
    const content = body?.content !== undefined ? cleanDoc(body.content, LIMITS.content, "content") : row.content;
    const canvas = body?.canvas !== undefined ? cleanDoc(body.canvas, LIMITS.canvas, "canvas") : row.canvas;
    if (title === row.title && content === row.content && canvas === row.canvas) return toPage(row);
    await this.snapshot(ctx, row, false);
    // Strictly later than the last save, so a quick second save still moves updated_at.
    let t = now();
    if (t <= row.updated_at) t = new Date(Date.parse(row.updated_at) + 1).toISOString();
    await dbRun(
      "UPDATE nb_pages SET title = ?, content = ?, canvas = ?, plain = ?, updated_at = ? WHERE id = ? AND owner = ?",
      title, content, canvas, plainText(title, parseDoc(content), parseDoc(canvas)), t, id, ctx.owner
    );
    return this.page(ctx, id);
  }

  async restoreVersion(ctx: NbCtx, pageId: number, versionId: number): Promise<Page> {
    const v = await this.version(ctx, pageId, versionId);
    const row = (await dbGet("SELECT * FROM nb_pages WHERE id = ? AND owner = ?", pageId, ctx.owner)) as any;
    // What's there now can be got back too.
    await this.snapshot(ctx, row, true);
    return this.savePage(ctx, pageId, { title: v.title, content: v.content, canvas: v.canvas });
  }

  /** A copy of the page (not its subpages) right after it. */
  async duplicatePage(ctx: NbCtx, id: number): Promise<Page> {
    const p = await this.page(ctx, id);
    const copy = await this.createPage(ctx, { sectionId: p.sectionId, parentId: p.parentId, title: `${p.title} (copy)`.slice(0, LIMITS.title), content: p.content, canvas: p.canvas });
    await this.move(ctx, "page", copy.id, { sectionId: p.sectionId, parentId: p.parentId }, await this.indexAfter(ctx, p));
    return this.page(ctx, copy.id);
  }

  /** Deletes the page with its subpages and history. */
  async deletePage(ctx: NbCtx, id: number) {
    const p = await this.page(ctx, id);
    const ids = [p.id, ...(await this.descendants(ctx, p.id))];
    const ph = ids.map(() => "?").join(",");
    await dbBatch([
      { sql: `DELETE FROM nb_page_versions WHERE owner = ? AND page_id IN (${ph})`, args: [ctx.owner, ...ids] },
      { sql: `DELETE FROM nb_pages WHERE owner = ? AND id IN (${ph})`, args: [ctx.owner, ...ids] },
    ]);
    return ids.length;
  }

  // ---- moving (drag to reorder) ----

  /**
   * Put a notebook, section or page at `index` among its new siblings.
   * Sections may move to another notebook; pages to another section or under
   * another page (never under themselves). A page carries its subpages.
   */
  async move(ctx: NbCtx, kind: "notebook" | "section" | "page", id: number, to: { notebookId?: number; sectionId?: number; parentId?: number | null }, index: number) {
    const at = Math.max(0, Math.floor(Number(index) || 0));
    if (kind === "notebook") {
      await this.ownNotebook(ctx, id);
      const sibs = ((await dbAll("SELECT id FROM nb_notebooks WHERE owner = ? AND id != ? ORDER BY sort, id", ctx.owner, id)) as any[]).map((r) => Number(r.id));
      await this.writeOrder("nb_notebooks", ctx.owner, place(sibs, id, at));
      return;
    }
    if (kind === "section") {
      const s = await this.ownSection(ctx, id);
      const notebookId = to.notebookId == null ? Number(s.notebook_id) : Number(to.notebookId);
      await this.ownNotebook(ctx, notebookId);
      if (notebookId !== Number(s.notebook_id)) await dbRun("UPDATE nb_sections SET notebook_id = ?, updated_at = ? WHERE id = ? AND owner = ?", notebookId, now(), id, ctx.owner);
      const sibs = ((await dbAll("SELECT id FROM nb_sections WHERE owner = ? AND notebook_id = ? AND id != ? ORDER BY sort, id", ctx.owner, notebookId, id)) as any[]).map((r) => Number(r.id));
      await this.writeOrder("nb_sections", ctx.owner, place(sibs, id, at));
      return;
    }
    const p = await this.page(ctx, id);
    const sectionId = to.sectionId == null ? p.sectionId : Number(to.sectionId);
    // Moving to another section without naming a parent: top level there.
    const parentId = to.parentId === undefined ? (sectionId === p.sectionId ? p.parentId : null) : to.parentId === null ? null : Number(to.parentId);
    await this.ownSection(ctx, sectionId);
    await this.assertOpen(ctx, sectionId);
    const subtree = await this.descendants(ctx, id);
    if (parentId !== null) {
      if (parentId === id || subtree.includes(parentId)) throw new NotebookError("A page can't go inside itself", 400);
      const parent = (await dbGet("SELECT section_id FROM nb_pages WHERE id = ? AND owner = ?", parentId, ctx.owner)) as any;
      if (!parent || Number(parent.section_id) !== sectionId) throw new NotebookError("The parent page isn't in that section", 400);
      if ((await this.depthOf(ctx, parentId)) + 1 + (await this.height(ctx, id)) > LIMITS.depth) throw new NotebookError("Pages can only nest so deep", 400);
    }
    if (sectionId !== p.sectionId || parentId !== p.parentId) {
      const ids = [id, ...subtree];
      const ph = ids.map(() => "?").join(",");
      await dbBatch([
        { sql: `UPDATE nb_pages SET section_id = ? WHERE owner = ? AND id IN (${ph})`, args: [sectionId, ctx.owner, ...ids] },
        { sql: "UPDATE nb_pages SET parent_id = ? WHERE id = ? AND owner = ?", args: [parentId, id, ctx.owner] },
      ]);
    }
    const sibs = ((await dbAll(
      "SELECT id FROM nb_pages WHERE owner = ? AND section_id = ? AND parent_id IS ? AND id != ? ORDER BY sort, id", ctx.owner, sectionId, parentId, id
    )) as any[]).map((r) => Number(r.id));
    await this.writeOrder("nb_pages", ctx.owner, place(sibs, id, at));
  }

  // ---- account ----

  /** Everything, for the account data export. Locked sections' pages are left out. */
  async exportAll(ctx: NbCtx) {
    const t = await this.tree(ctx, { starter: false });
    const open = new Set(t.pages.map((p) => p.id));
    const pages = ((await dbAll("SELECT * FROM nb_pages WHERE owner = ? ORDER BY section_id, sort, id", ctx.owner)) as any[])
      .filter((r) => open.has(Number(r.id))).map(toPage);
    return { notebooks: t.notebooks, sections: t.sections.map(({ unlocked: _u, ...s }) => s), pages };
  }

  // ---- helpers ----

  private async ownNotebook(ctx: NbCtx, id: number) {
    const nb = (await dbGet("SELECT * FROM nb_notebooks WHERE id = ? AND owner = ?", id, ctx.owner)) as any;
    if (!nb) throw notFound();
    return nb;
  }
  private async ownSection(ctx: NbCtx, id: number) {
    const s = (await dbGet("SELECT * FROM nb_sections WHERE id = ? AND owner = ?", id, ctx.owner)) as any;
    if (!s) throw notFound();
    return s;
  }
  /** 423 when the section is locked and this sign-in hasn't unlocked it. */
  private async assertOpen(ctx: NbCtx, sectionId: number) {
    const s = (await dbGet("SELECT password_hash FROM nb_sections WHERE id = ? AND owner = ?", sectionId, ctx.owner)) as any;
    if (!s) throw notFound();
    if (s.password_hash && !ctx.unlocked(sectionId)) throw lockedError(sectionId);
  }
  private async descendants(ctx: NbCtx, id: number): Promise<number[]> {
    const rows = (await dbAll(
      `WITH RECURSIVE sub(id) AS (SELECT id FROM nb_pages WHERE parent_id = ? AND owner = ?
         UNION SELECT p.id FROM nb_pages p JOIN sub ON p.parent_id = sub.id WHERE p.owner = ?)
       SELECT id FROM sub`, id, ctx.owner, ctx.owner
    )) as any[];
    return rows.map((r) => Number(r.id));
  }
  /** Ancestors above a page (0 = top level). */
  private async depthOf(ctx: NbCtx, id: number): Promise<number> {
    let d = 0;
    let cur: number | null = await this.parentOf(ctx, id);
    while (cur !== null && d < 50) { d++; cur = await this.parentOf(ctx, cur); }
    return d;
  }
  private async parentOf(ctx: NbCtx, id: number): Promise<number | null> {
    const r = (await dbGet("SELECT parent_id FROM nb_pages WHERE id = ? AND owner = ?", id, ctx.owner)) as any;
    return r?.parent_id == null ? null : Number(r.parent_id);
  }
  /** Levels of subpages under a page (0 = none). */
  private async height(ctx: NbCtx, id: number): Promise<number> {
    const kids = ((await dbAll("SELECT id FROM nb_pages WHERE parent_id = ? AND owner = ?", id, ctx.owner)) as any[]).map((r) => Number(r.id));
    let h = 0;
    for (const k of kids) h = Math.max(h, 1 + (await this.height(ctx, k)));
    return h;
  }
  private async indexAfter(ctx: NbCtx, p: TreePage): Promise<number> {
    const sibs = ((await dbAll(
      "SELECT id FROM nb_pages WHERE owner = ? AND section_id = ? AND parent_id IS ? ORDER BY sort, id", ctx.owner, p.sectionId, p.parentId
    )) as any[]).map((r) => Number(r.id));
    return sibs.indexOf(p.id) + 1;
  }
  private async writeOrder(table: "nb_notebooks" | "nb_sections" | "nb_pages", owner: string, ids: number[]) {
    if (!ids.length) return;
    await dbBatch(ids.map((id, i) => ({ sql: `UPDATE ${table} SET sort = ? WHERE id = ? AND owner = ?`, args: [i, id, owner] })));
  }
  /** Keep the state before this save in the history (rate-limited unless `force`). */
  private async snapshot(ctx: NbCtx, row: any, force: boolean) {
    if (!row.content && !row.canvas && !row.title) return;
    const last = (await dbGet("SELECT created_at FROM nb_page_versions WHERE page_id = ? AND owner = ? ORDER BY id DESC LIMIT 1", row.id, ctx.owner)) as any;
    if (!force && last && Date.now() - Date.parse(last.created_at) < VERSION_EVERY_MS) return;
    await dbRun(
      "INSERT INTO nb_page_versions (owner, page_id, title, content, canvas, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ctx.owner, row.id, row.title, row.content, row.canvas, now()
    );
    await dbRun(
      `DELETE FROM nb_page_versions WHERE page_id = ? AND owner = ? AND id NOT IN
         (SELECT id FROM nb_page_versions WHERE page_id = ? AND owner = ? ORDER BY id DESC LIMIT ?)`,
      row.id, ctx.owner, row.id, ctx.owner, LIMITS.versionsPerPage
    );
  }
}

function place(siblings: number[], id: number, index: number): number[] {
  const out = siblings.slice();
  out.splice(Math.min(index, out.length), 0, id);
  return out;
}

function toTreePage(r: any): TreePage {
  return { id: Number(r.id), sectionId: Number(r.section_id), parentId: r.parent_id == null ? null : Number(r.parent_id), title: r.title, sort: Number(r.sort), updatedAt: r.updated_at };
}
function toPage(r: any): Page {
  return { ...toTreePage(r), content: parseDoc(r.content), canvas: parseDoc(r.canvas), createdAt: r.created_at };
}

/** ~160 characters of text around the first match. */
export function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 160);
  const start = Math.max(0, i - 60);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 160)}${start + 160 < text.length ? "…" : ""}`;
}

/** Deletes an account's whole notebook (account deletion). */
export async function deleteNotebookData(owner: string) {
  if (!owner) return;
  await dbBatch([
    { sql: "DELETE FROM nb_page_versions WHERE owner = ?", args: [owner] },
    { sql: "DELETE FROM nb_pages WHERE owner = ?", args: [owner] },
    { sql: "DELETE FROM nb_sections WHERE owner = ?", args: [owner] },
    { sql: "DELETE FROM nb_notebooks WHERE owner = ?", args: [owner] },
  ]);
}

export interface NotebookDeps {
  requireAuth(req: any, res: any): Promise<{ memberId: number; email?: string; teamless?: boolean } | null>;
  /** The signed-in account's email. */
  accountEmail(auth: { memberId: number; email?: string; teamless?: boolean }): Promise<string>;
  /** This sign-in's session key (unlocks belong to it). */
  sessionKey(req: any): string | null;
}

export const notebookStore = new NotebookStore();
export const unlockGrants = new UnlockGrants();
const unlockLimiter = new RateLimiter();
const UNLOCK_RULE = { max: 10, windowMs: 15 * 60 * 1000 };

export function registerNotebookRoutes(app: any, deps: NotebookDeps) {
  const store = notebookStore;
  setInterval(() => { unlockGrants.sweep(); unlockLimiter.sweep(); }, 10 * 60 * 1000).unref?.();

  /** Builds the caller's context, or answers 401. */
  const context = async (req: any, res: any): Promise<NbCtx | null> => {
    const auth = await deps.requireAuth(req, res);
    if (!auth) return null;
    const owner = ownerKey(await deps.accountEmail(auth));
    if (!owner) { res.status(401).json({ error: "Not signed in" }); return null; }
    const session = deps.sessionKey(req);
    return { owner, unlocked: (sectionId) => unlockGrants.has(session, sectionId) };
  };
  const id = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
  /** Runs a handler: NotebookErrors become their status. */
  const handle = (fn: (ctx: NbCtx, req: any, res: any) => Promise<unknown>) => async (req: any, res: any) => {
    const ctx = await context(req, res);
    if (!ctx) return;
    try {
      const out = await fn(ctx, req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof NotebookError) return res.status(e.status).json({ error: e.message, ...e.extra });
      console.error("notebook:", e);
      res.status(500).json({ error: "Something went wrong" });
    }
  };

  app.get("/api/notebook/tree", handle((ctx) => store.tree(ctx)));
  app.get("/api/notebook/search", handle((ctx, req) => store.search(ctx, String(req.query.q || ""), Number(req.query.limit) || 30)));

  app.post("/api/notebook/notebooks", handle((ctx, req) => store.createNotebook(ctx, req.body)));
  app.patch("/api/notebook/notebooks/:id", handle((ctx, req) => store.updateNotebook(ctx, id(req.params.id), req.body)));
  app.delete("/api/notebook/notebooks/:id", handle((ctx, req) => store.deleteNotebook(ctx, id(req.params.id))));

  app.post("/api/notebook/sections", handle((ctx, req) => store.createSection(ctx, req.body)));
  app.patch("/api/notebook/sections/:id", handle((ctx, req) => store.updateSection(ctx, id(req.params.id), req.body)));
  app.delete("/api/notebook/sections/:id", handle((ctx, req) => store.deleteSection(ctx, id(req.params.id))));

  // Lock: { password, current? } sets or changes it; { password: null, current } removes it.
  app.put("/api/notebook/sections/:id/lock", handle(async (ctx, req) => {
    const sectionId = id(req.params.id);
    const limited = unlockLimiter.hit(`${ctx.owner}|${sectionId}`, UNLOCK_RULE);
    if (limited) throw new NotebookError(`Too many tries. Wait ${Math.ceil(limited / 60)} min.`, 429);
    await store.setSectionPassword(ctx, sectionId, req.body?.current, req.body?.password === null ? null : req.body?.password);
    unlockGrants.revokeSection(sectionId);
    const session = deps.sessionKey(req);
    // Whoever just set the password keeps the section open on this sign-in.
    if (req.body?.password !== null && session) unlockGrants.grant(session, sectionId);
    return { ok: true, locked: req.body?.password !== null };
  }));
  app.post("/api/notebook/sections/:id/unlock", handle(async (ctx, req) => {
    const sectionId = id(req.params.id);
    const session = deps.sessionKey(req);
    if (!session) throw new NotebookError("Sign in again to unlock", 401);
    const key = `${ctx.owner}|${sectionId}`;
    const limited = unlockLimiter.hit(key, UNLOCK_RULE);
    if (limited) throw new NotebookError(`Too many tries. Wait ${Math.ceil(limited / 60)} min.`, 429);
    if (!(await store.checkSectionPassword(ctx, sectionId, req.body?.password))) throw new NotebookError("Wrong password", 403);
    unlockLimiter.reset(key);
    unlockGrants.grant(session, sectionId);
    return { ok: true, until: new Date(Date.now() + UNLOCK_MS).toISOString() };
  }));
  app.post("/api/notebook/sections/:id/relock", handle(async (_ctx, req) => {
    const session = deps.sessionKey(req);
    if (session) unlockGrants.revoke(session, id(req.params.id));
    return { ok: true };
  }));

  app.post("/api/notebook/pages", handle((ctx, req) => store.createPage(ctx, req.body)));
  app.get("/api/notebook/pages/:id", handle((ctx, req) => store.page(ctx, id(req.params.id))));
  app.put("/api/notebook/pages/:id", handle((ctx, req) => store.savePage(ctx, id(req.params.id), req.body)));
  app.delete("/api/notebook/pages/:id", handle(async (ctx, req) => ({ ok: true, deleted: await store.deletePage(ctx, id(req.params.id)) })));
  app.post("/api/notebook/pages/:id/duplicate", handle((ctx, req) => store.duplicatePage(ctx, id(req.params.id))));
  app.get("/api/notebook/pages/:id/versions", handle((ctx, req) => store.versions(ctx, id(req.params.id))));
  app.get("/api/notebook/pages/:id/versions/:vid", handle((ctx, req) => store.version(ctx, id(req.params.id), id(req.params.vid))));
  app.post("/api/notebook/pages/:id/versions/:vid/restore", handle((ctx, req) => store.restoreVersion(ctx, id(req.params.id), id(req.params.vid))));

  // Drag to reorder: { kind, id, to: { notebookId?, sectionId?, parentId? }, index }
  app.post("/api/notebook/move", handle(async (ctx, req) => {
    const kind = req.body?.kind;
    if (kind !== "notebook" && kind !== "section" && kind !== "page") throw new NotebookError("Unknown item", 400);
    const to = req.body?.to && typeof req.body.to === "object" ? req.body.to : {};
    await store.move(ctx, kind, id(req.body?.id), {
      notebookId: to.notebookId == null ? undefined : id(to.notebookId),
      sectionId: to.sectionId == null ? undefined : id(to.sectionId),
      parentId: to.parentId === undefined ? undefined : to.parentId === null ? null : id(to.parentId),
    }, Number(req.body?.index) || 0);
    return store.tree(ctx);
  }));
}
