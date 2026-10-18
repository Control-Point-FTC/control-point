// Notebook mentor review (feature parity 3.4). A member submits an entry for
// review; a reviewer (the "Review notebook entries" permission, which admins
// hold) approves it or asks for changes with a comment; the member is told.
// A page has at most one open request. Visibility follows the notebook: a
// page the member can't see (protected) reads as not found.
import { NotebookError, type NotebookStore, type NotebookContext } from "./notebook.js";

type Auth = { memberId: number; teamId: number | null };
export interface ReviewDeps {
  requireAuth: (req: any, res: any) => Promise<Auth | null>;
  memberPerms: (memberId: number, teamId: number) => Promise<Set<string>>;
  dbGet: (sql: string, ...args: any[]) => Promise<any>;
  dbAll: (sql: string, ...args: any[]) => Promise<any[]>;
  dbRun: (sql: string, ...args: any[]) => Promise<any>;
  notify: (teamId: number, actorId: number, recipientIds: number[], content: string, meta: Record<string, unknown>) => Promise<void> | void;
  broadcastToTeam: (teamId: number, msg: any) => void;
}

export const REVIEW_STATUSES = ["pending", "approved", "changes"] as const;
const MAX_COMMENT = 1000;
const ctxOf = (auth: Auth): NotebookContext => ({ memberId: auth.memberId, teamId: auth.teamId!, source: "human" });

export function reviewStore(deps: ReviewDeps, notebook: NotebookStore) {
  const canReview = async (auth: Auth) => { const p = await deps.memberPerms(auth.memberId, auth.teamId!); return p.has("*") || p.has("review_notebook"); };
  const reviewers = async (teamId: number) => {
    const members = await deps.dbAll("SELECT id FROM members WHERE team_id = ? AND COALESCE(is_active, 1) = 1", teamId);
    const out: number[] = [];
    for (const m of members) { const p = await deps.memberPerms(Number(m.id), teamId); if (p.has("*") || p.has("review_notebook")) out.push(Number(m.id)); }
    return out;
  };
  const row = (r: any) => r && ({
    id: Number(r.id), pageId: Number(r.page_id), pageTitle: r.page_title ?? null, status: r.status,
    requestedBy: Number(r.requested_by), requestedByName: r.requested_by_name ?? null, requestedAt: r.requested_at, note: r.note || "",
    reviewerName: r.reviewer_name ?? null, reviewedAt: r.reviewed_at ?? null, comment: r.comment || "",
  });
  const SELECT = `SELECT r.*, p.title AS page_title, rq.name AS requested_by_name, rv.name AS reviewer_name FROM notebook_reviews r
    JOIN notebook_pages p ON p.id = r.page_id LEFT JOIN members rq ON rq.id = r.requested_by LEFT JOIN members rv ON rv.id = r.reviewer_id`;
  /** The page must be one this member can open (the notebook's own access rules). */
  const visiblePage = async (auth: Auth, pageId: number) => notebook.page(ctxOf(auth), pageId);
  /** Of these members, the ones who can open the page now; a notice never reaches anyone else. */
  const canOpen = async (teamId: number, pageId: number, ids: number[]) => {
    const out: number[] = [];
    for (const id of ids) { try { await notebook.page({ memberId: id, teamId, source: "human" }, pageId); out.push(id); } catch { /* can't open it */ } }
    return out;
  };
  /** The page's name for a notice: a protected page's title stays out of notifications. */
  const noticeName = (page: { title?: string; protected?: boolean }) => page.protected ? "a notebook entry" : `notebook entry "${String(page.title || "Untitled").slice(0, 80)}"`;

  return {
    canReview,
    /** The latest review of a page (open or decided), and whether this member can review it. */
    async forPage(auth: Auth, pageId: number) {
      await visiblePage(auth, pageId);
      const r = await deps.dbGet(`${SELECT} WHERE r.page_id = ? AND r.team_id = ? ORDER BY r.id DESC LIMIT 1`, pageId, auth.teamId);
      const reviewer = await canReview(auth);
      // Withdraw is offered only to who may use it: the requester, or a reviewer.
      const canWithdraw = !!r && r.status === "pending" && (Number(r.requested_by) === auth.memberId || reviewer);
      return { review: row(r) ?? null, canReview: reviewer, canWithdraw };
    },
    /** Submits a page for review (anyone who can see it); one open request per page. */
    async request(auth: Auth, pageId: number, note: unknown) {
      const page: any = await visiblePage(auth, pageId);
      const open = await deps.dbGet("SELECT id FROM notebook_reviews WHERE page_id = ? AND team_id = ? AND status = 'pending'", pageId, auth.teamId);
      if (open) throw new NotebookError("This entry is already waiting for review", 409);
      const text = typeof note === "string" ? note.replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT) : "";
      let r: any;
      try {
        r = await deps.dbRun("INSERT INTO notebook_reviews (team_id, page_id, requested_by, requested_at, status, note) VALUES (?, ?, ?, ?, 'pending', ?)",
          auth.teamId, pageId, auth.memberId, new Date().toISOString(), text);
      } catch (e) {
        // Two people asked at once: the one-open-request index lets only the first through.
        if (/UNIQUE|constraint/i.test(String((e as Error)?.message))) throw new NotebookError("This entry is already waiting for review", 409);
        throw e;
      }
      const name = noticeName(page);
      void deps.notify(auth.teamId!, auth.memberId, await canOpen(auth.teamId!, pageId, await reviewers(auth.teamId!)), `${name[0].toUpperCase()}${name.slice(1)} is waiting for your review`, { notebook_page_id: pageId });
      deps.broadcastToTeam(auth.teamId!, { type: "notebook_reviews_changed" });
      return this.forPage(auth, pageId).then((x) => ({ ...x, id: Number(r?.lastInsertRowid) }));
    },
    /** Withdraws an open request (its requester, or a reviewer). */
    async withdraw(auth: Auth, pageId: number) {
      await visiblePage(auth, pageId);
      const open = await deps.dbGet("SELECT id, requested_by FROM notebook_reviews WHERE page_id = ? AND team_id = ? AND status = 'pending'", pageId, auth.teamId);
      if (!open) throw new NotebookError("There's no open review request for this entry", 404);
      if (Number(open.requested_by) !== auth.memberId && !(await canReview(auth))) throw new NotebookError("Only the person who asked can withdraw it", 403);
      // Only while still open: a reviewer's decision that landed meanwhile is never erased.
      const w = await deps.dbRun("DELETE FROM notebook_reviews WHERE id = ? AND status = 'pending'", open.id);
      if (!Number(w?.changes ?? w?.rowsAffected ?? 0)) throw new NotebookError("Someone already reviewed this entry", 409);
      deps.broadcastToTeam(auth.teamId!, { type: "notebook_reviews_changed" });
      return { ok: true };
    },
    /** A reviewer's decision on an open request: approve, or ask for changes (a comment is required then). */
    async decide(auth: Auth, reviewId: number, body: any) {
      if (!(await canReview(auth))) throw new NotebookError("Only reviewers can approve entries", 403);
      const status = body?.status;
      if (status !== "approved" && status !== "changes") throw new NotebookError("Approve it or ask for changes");
      const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT) : "";
      if (status === "changes" && !comment) throw new NotebookError("Say what should change");
      const r = await deps.dbGet("SELECT * FROM notebook_reviews WHERE id = ? AND team_id = ?", reviewId, auth.teamId);
      if (!r) throw new NotebookError("That review is gone", 404);
      const page: any = await visiblePage(auth, Number(r.page_id));
      // Only an open request is decided (two reviewers at once: the first wins).
      const w = await deps.dbRun("UPDATE notebook_reviews SET status = ?, reviewer_id = ?, reviewed_at = ?, comment = ? WHERE id = ? AND status = 'pending'",
        status, auth.memberId, new Date().toISOString(), comment, reviewId);
      if (!Number(w?.changes ?? w?.rowsAffected ?? 0)) throw new NotebookError("Someone already reviewed this entry", 409);
      // The comment is about the page, so it only goes along when the page isn't protected.
      void deps.notify(auth.teamId!, auth.memberId, await canOpen(auth.teamId!, Number(r.page_id), [Number(r.requested_by)]),
        `${status === "approved" ? "Approved" : "Changes requested"}: ${noticeName(page)}${comment && !page.protected ? ` — ${comment.slice(0, 140)}` : ""}`, { notebook_page_id: Number(r.page_id) });
      deps.broadcastToTeam(auth.teamId!, { type: "notebook_reviews_changed" });
      return row(await deps.dbGet(`${SELECT} WHERE r.id = ?`, reviewId));
    },
    /** The queue: open requests (all of them for reviewers, a member's own otherwise), plus recent decisions. */
    async queue(auth: Auth) {
      const reviewer = await canReview(auth);
      // Only pages this member can open (protected ones stay hidden), filtered before the limit.
      const visible = (await notebook.tree(ctxOf(auth))).pages.map((p) => p.id);
      const rows = await deps.dbAll(`${SELECT} WHERE r.team_id = ? AND p.deleted_at IS NULL AND r.page_id IN (SELECT value FROM json_each(?))${reviewer ? "" : " AND r.requested_by = ?"}
        AND (r.status = 'pending' OR r.reviewed_at >= ?) ORDER BY r.status = 'pending' DESC, COALESCE(r.reviewed_at, r.requested_at) DESC LIMIT 200`,
        auth.teamId, JSON.stringify(visible), ...(reviewer ? [] : [auth.memberId]), new Date(Date.now() - 30 * 86_400_000).toISOString());
      const items = rows.map(row);
      return { canReview: reviewer, pending: items.filter((i) => i.status === "pending").length, items };
    },
  };
}

export function registerNotebookReviewRoutes(app: any, deps: ReviewDeps, notebook: NotebookStore) {
  const store = reviewStore(deps, notebook);
  const handle = (fn: (auth: Auth, req: any) => Promise<unknown>) => async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = await deps.requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.status(403).json({ error: "Select an active team" });
    try {
      // Same rule as the notebook routes: a tab still showing another workspace can't read or decide here.
      if (req.headers["x-cp-notebook-team"] !== undefined && Number(req.headers["x-cp-notebook-team"]) !== auth.teamId) throw new NotebookError("Workspace changed; reopen this notebook in its workspace", 409);
      res.json(await fn(auth, req));
    }
    catch (e) {
      if (e instanceof NotebookError) return res.status(e.status).json({ error: e.message });
      console.error("notebook review request failed", e);
      res.status(500).json({ error: "Notebook request failed" });
    }
  };
  const id = (v: unknown) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new NotebookError("Not found", 404); return n; };
  app.get("/api/notebook/reviews", handle((a) => store.queue(a)));
  app.get("/api/notebook/pages/:id/review", handle((a, req) => store.forPage(a, id(req.params.id))));
  app.post("/api/notebook/pages/:id/review", handle((a, req) => store.request(a, id(req.params.id), req.body?.note)));
  app.delete("/api/notebook/pages/:id/review", handle((a, req) => store.withdraw(a, id(req.params.id))));
  app.put("/api/notebook/reviews/:id", handle((a, req) => store.decide(a, id(req.params.id), req.body ?? {})));
  return store;
}
