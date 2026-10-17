// Checklists (feature parity 4.1): templates and runs. Everyone on the team
// can start a run and check items off; templates are edited by members with
// "Manage checklists" (or "Manage tasks", which existing teams' members
// already hold). A run keeps its own copy of the template's sections, so
// editing a template never changes a run in progress. Bruno reads them
// through a lookup and starts runs or checks items off through a card.
import type { Express } from "express";
import {
  cleanChecklistTemplate, isItemState, itemCount, runProgress, starterTemplate, STARTER_CHECKLISTS,
  type ChecklistSection, type ItemState,
} from "../src/types/checklists.js";

type Auth = { memberId: number; teamId: number | null };
export interface ChecklistDeps {
  requireAuth: (req: any, res: any) => Promise<Auth | null>;
  hasPerm: (auth: Auth, perm: string) => Promise<boolean>;
  dbGet: (sql: string, ...args: any[]) => Promise<any>;
  dbAll: (sql: string, ...args: any[]) => Promise<any[]>;
  dbRun: (sql: string, ...args: any[]) => Promise<any>;
  broadcastToTeam: (teamId: number, msg: any) => void;
}

const MAX_NOTE = 200;
const LOG_PAGE = 50;
const RUN_SELECT = `SELECT r.*, e.title AS event_title, sb.name AS started_by_name, fb.name AS finished_by_name FROM checklist_runs r
  LEFT JOIN events e ON e.id = r.event_id LEFT JOIN members sb ON sb.id = r.started_by LEFT JOIN members fb ON fb.id = r.finished_by`;
const parseSections = (raw: unknown): ChecklistSection[] => { try { const v = JSON.parse(String(raw)); return Array.isArray(v) ? v : []; } catch { return []; } };

export class ChecklistError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

/** The checklist operations, shared by the routes and Bruno's card. */
export function checklistStore(deps: ChecklistDeps) {
  const { dbGet, dbAll, dbRun } = deps;
  const canManage = async (auth: Auth) => (await deps.hasPerm(auth, "manage_checklists")) || (await deps.hasPerm(auth, "manage_tasks"));
  const changed = (teamId: number, runId?: number) => deps.broadcastToTeam(teamId, { type: "checklists_changed", ...(runId ? { run_id: runId } : {}) });

  async function states(runId: number): Promise<Record<string, any>> {
    const rows = await dbAll(`SELECT i.item_id, i.state, i.note, i.assignee_id, i.set_by, i.set_at, s.name AS set_by_name, a.name AS assignee_name
      FROM checklist_run_items i LEFT JOIN members s ON s.id = i.set_by LEFT JOIN members a ON a.id = i.assignee_id WHERE i.run_id = ?`, runId);
    return Object.fromEntries(rows.map((r) => [String(r.item_id), {
      state: isItemState(r.state) ? r.state : "open", note: r.note || "", assigneeId: r.assignee_id ?? null, assigneeName: r.assignee_name ?? null,
      setBy: r.set_by ?? null, setByName: r.set_by_name ?? null, setAt: r.set_at ?? null,
    }]));
  }
  const progressOf = (sections: ChecklistSection[], st: Record<string, any>) => runProgress(sections, Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v.state as ItemState])));
  const runSummary = (r: any, st: Record<string, any>) => {
    const sections = parseSections(r.sections);
    return { id: Number(r.id), title: r.title, templateId: r.template_id ?? null, eventId: r.event_id ?? null, eventTitle: r.event_title ?? null, status: r.status,
      startedAt: r.started_at, startedByName: r.started_by_name ?? null, finishedAt: r.finished_at ?? null, finishedByName: r.finished_by_name ?? null,
      progress: progressOf(sections, st) };
  };
  const runRow = (teamId: number, id: number) => dbGet(`${RUN_SELECT} WHERE r.id = ? AND r.team_id = ?`, id, teamId);

  return {
    canManage,
    async overview(auth: Auth) {
      const teamId = auth.teamId!;
      const templates = (await dbAll("SELECT * FROM checklist_templates WHERE team_id = ? AND archived_at IS NULL ORDER BY title COLLATE NOCASE", teamId))
        .map((t) => ({ id: Number(t.id), title: t.title, description: t.description || "", starter: t.starter ?? null, sections: parseSections(t.sections), itemCount: itemCount({ sections: parseSections(t.sections) }) }));
      // Every open run, then the newest page of the run log.
      const open = await dbAll(`${RUN_SELECT} WHERE r.team_id = ? AND r.status = 'open' ORDER BY r.started_at DESC`, teamId);
      const log = await this.runLog(auth);
      const runs = [];
      for (const r of open) runs.push(runSummary(r, await states(Number(r.id))));
      return {
        templates, runs: [...runs, ...log.runs], logMore: log.more, canManage: await canManage(auth),
        starters: STARTER_CHECKLISTS.map((s) => ({ key: s.key, title: s.title, description: s.description, itemCount: itemCount(starterTemplate(s.key)!) })),
      };
    },
    /** Finished runs, newest first, a page at a time (before = the last finishedAt shown). */
    async runLog(auth: Auth, before?: unknown) {
      const cursor = typeof before === "string" && before ? before : "9999";
      const rows = await dbAll(`${RUN_SELECT} WHERE r.team_id = ? AND r.status = 'finished' AND r.finished_at < ? ORDER BY r.finished_at DESC LIMIT ${LOG_PAGE + 1}`, auth.teamId, cursor);
      const runs = [];
      for (const r of rows.slice(0, LOG_PAGE)) runs.push(runSummary(r, await states(Number(r.id))));
      return { runs, more: rows.length > LOG_PAGE };
    },
    async saveTemplate(auth: Auth, body: any, id?: number) {
      if (!(await canManage(auth))) throw new ChecklistError("Only members who can manage checklists can change templates", 403);
      const value = body?.starter ? starterTemplate(String(body.starter)) : null;
      if (body?.starter && !value) throw new ChecklistError("Unknown starter checklist");
      const c = value ? { value } : cleanChecklistTemplate(body);
      if ("error" in c) throw new ChecklistError(c.error);
      const now = new Date().toISOString();
      if (id) {
        const row = await dbGet("SELECT id FROM checklist_templates WHERE id = ? AND team_id = ? AND archived_at IS NULL", id, auth.teamId);
        if (!row) throw new ChecklistError("That checklist is gone", 404);
        await dbRun("UPDATE checklist_templates SET title = ?, description = ?, sections = ?, updated_at = ? WHERE id = ?", c.value.title, c.value.description ?? "", JSON.stringify(c.value.sections), now, id);
      } else {
        const r = await dbRun("INSERT INTO checklist_templates (team_id, title, description, sections, starter, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          auth.teamId, c.value.title, c.value.description ?? "", JSON.stringify(c.value.sections), c.value.starter ?? null, auth.memberId, now, now);
        id = Number(r?.lastInsertRowid);
      }
      changed(auth.teamId!);
      return { id };
    },
    async archiveTemplate(auth: Auth, id: number) {
      if (!(await canManage(auth))) throw new ChecklistError("Only members who can manage checklists can remove templates", 403);
      const r = await dbRun("UPDATE checklist_templates SET archived_at = ? WHERE id = ? AND team_id = ? AND archived_at IS NULL", new Date().toISOString(), id, auth.teamId);
      if (!Number(r?.changes ?? r?.rowsAffected ?? 0)) throw new ChecklistError("That checklist is gone", 404);
      changed(auth.teamId!);
      return { ok: true };
    },
    /** Starts a run of a template (anyone on the team), optionally for a calendar event. */
    async startRun(auth: Auth, body: any) {
      const t = await dbGet("SELECT * FROM checklist_templates WHERE id = ? AND team_id = ? AND archived_at IS NULL", Number(body?.templateId), auth.teamId);
      if (!t) throw new ChecklistError("Pick a checklist to run", 404);
      let eventId: number | null = null;
      if (body?.eventId !== undefined && body?.eventId !== null && body?.eventId !== "") {
        const e = await dbGet("SELECT id FROM events WHERE id = ? AND team_id = ?", Number(body.eventId), auth.teamId);
        if (!e) throw new ChecklistError("That event isn't on this team's calendar");
        eventId = Number(e.id);
      }
      const title = (typeof body?.title === "string" && body.title.replace(/\s+/g, " ").trim().slice(0, 80)) || t.title;
      const r = await dbRun("INSERT INTO checklist_runs (team_id, template_id, title, sections, event_id, status, started_by, started_at) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)",
        auth.teamId, t.id, title, t.sections, eventId, auth.memberId, new Date().toISOString());
      const id = Number(r?.lastInsertRowid);
      changed(auth.teamId!, id);
      return { id };
    },
    async run(auth: Auth, id: number) {
      const r = await runRow(auth.teamId!, id);
      if (!r) throw new ChecklistError("That run is gone", 404);
      const st = await states(id);
      return { ...runSummary(r, st), sections: parseSections(r.sections), items: st };
    },
    /** Sets one item: state (done / partial / N/A / open), a note, an assignee. Who and when are recorded. */
    async setItem(auth: Auth, runId: number, itemId: string, body: any) {
      const r = await runRow(auth.teamId!, runId);
      if (!r) throw new ChecklistError("That run is gone", 404);
      if (r.status !== "open") throw new ChecklistError("This run is finished — reopen it to change items");
      if (!parseSections(r.sections).some((s) => s.items.some((i) => i.id === itemId))) throw new ChecklistError("That item isn't on this checklist", 404);
      if (body?.state !== undefined && !isItemState(body.state)) throw new ChecklistError("Mark it done, partly done, N/A or not done");
      let assignee: number | null | undefined;
      if (body?.assigneeId !== undefined) {
        if (body.assigneeId === null || body.assigneeId === "") assignee = null;
        else {
          const m = await dbGet("SELECT id FROM members WHERE id = ? AND team_id = ? AND COALESCE(is_active, 1) = 1", Number(body.assigneeId), auth.teamId);
          if (!m) throw new ChecklistError("Pick someone on this team");
          assignee = Number(m.id);
        }
      }
      const note = body?.note !== undefined ? String(body.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : undefined;
      const now = new Date().toISOString();
      const stateChange = body?.state !== undefined;
      // The write itself requires the run to still be open, so a run finished
      // meanwhile by someone else is never changed.
      const w = await dbRun(`INSERT INTO checklist_run_items (run_id, item_id, state, note, assignee_id, set_by, set_at)
        SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM checklist_runs WHERE id = ? AND status = 'open')
        ON CONFLICT(run_id, item_id) DO UPDATE SET
          state = CASE WHEN ? THEN excluded.state ELSE state END,
          note = CASE WHEN ? THEN excluded.note ELSE note END,
          assignee_id = CASE WHEN ? THEN excluded.assignee_id ELSE assignee_id END,
          set_by = CASE WHEN ? THEN excluded.set_by ELSE set_by END,
          set_at = CASE WHEN ? THEN excluded.set_at ELSE set_at END`,
        runId, itemId, stateChange ? body.state : "open", note ?? "", assignee ?? null, stateChange ? auth.memberId : null, stateChange ? now : null, runId,
        stateChange ? 1 : 0, note !== undefined ? 1 : 0, assignee !== undefined ? 1 : 0, stateChange ? 1 : 0, stateChange ? 1 : 0);
      if (!Number(w?.changes ?? w?.rowsAffected ?? 0)) throw new ChecklistError("This run was just finished — reopen it to change items");
      changed(auth.teamId!, runId);
      return (await this.run(auth, runId));
    },
    async finish(auth: Auth, runId: number, reopen = false) {
      const r = await runRow(auth.teamId!, runId);
      if (!r) throw new ChecklistError("That run is gone", 404);
      if (reopen) await dbRun("UPDATE checklist_runs SET status = 'open', finished_by = NULL, finished_at = NULL WHERE id = ?", runId);
      else await dbRun("UPDATE checklist_runs SET status = 'finished', finished_by = ?, finished_at = ? WHERE id = ? AND status = 'open'", auth.memberId, new Date().toISOString(), runId);
      changed(auth.teamId!, runId);
      return this.run(auth, runId);
    },
    /** Clears every item of an open run (the page asks first). */
    async reset(auth: Auth, runId: number) {
      const r = await runRow(auth.teamId!, runId);
      if (!r) throw new ChecklistError("That run is gone", 404);
      if (r.status !== "open") throw new ChecklistError("Reopen the run before resetting it");
      // Only while still open: a run finished meanwhile keeps its record.
      await dbRun("DELETE FROM checklist_run_items WHERE run_id = ? AND EXISTS (SELECT 1 FROM checklist_runs WHERE id = ? AND status = 'open')", runId, runId);
      if ((await runRow(auth.teamId!, runId))?.status !== "open") throw new ChecklistError("This run was just finished — reopen it before resetting");
      changed(auth.teamId!, runId);
      return this.run(auth, runId);
    },
    async removeRun(auth: Auth, runId: number) {
      if (!(await canManage(auth))) throw new ChecklistError("Only members who can manage checklists can delete runs", 403);
      const r = await runRow(auth.teamId!, runId);
      if (!r) throw new ChecklistError("That run is gone", 404);
      await dbRun("DELETE FROM checklist_run_items WHERE run_id = ?", runId);
      await dbRun("DELETE FROM checklist_runs WHERE id = ?", runId);
      changed(auth.teamId!);
      return { ok: true };
    },
  };
}

export function registerChecklistRoutes(app: Express, deps: ChecklistDeps) {
  const store = checklistStore(deps);
  const handle = (fn: (auth: Auth, req: any) => Promise<unknown>) => async (req: any, res: any) => {
    const auth = await deps.requireAuth(req, res);
    if (!auth) return;
    if (!auth.teamId) return res.status(400).json({ error: "Join a workspace first" });
    try { res.json(await fn(auth, req)); }
    catch (e) {
      if (e instanceof ChecklistError) return res.status(e.status).json({ error: e.message });
      console.error("Checklist request failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  const id = (v: unknown) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw new ChecklistError("Not found", 404); return n; };
  app.get("/api/checklists", handle((a) => store.overview(a)));
  app.get("/api/checklists/log", handle((a, req) => store.runLog(a, req.query.before)));
  app.post("/api/checklists/templates", handle((a, req) => store.saveTemplate(a, req.body)));
  app.put("/api/checklists/templates/:id", handle((a, req) => store.saveTemplate(a, req.body, id(req.params.id))));
  app.delete("/api/checklists/templates/:id", handle((a, req) => store.archiveTemplate(a, id(req.params.id))));
  app.post("/api/checklists/runs", handle((a, req) => store.startRun(a, req.body)));
  app.get("/api/checklists/runs/:id", handle((a, req) => store.run(a, id(req.params.id))));
  app.put("/api/checklists/runs/:id/items/:item", handle((a, req) => store.setItem(a, id(req.params.id), String(req.params.item), req.body ?? {})));
  app.post("/api/checklists/runs/:id/finish", handle((a, req) => store.finish(a, id(req.params.id))));
  app.post("/api/checklists/runs/:id/reopen", handle((a, req) => store.finish(a, id(req.params.id), true)));
  app.post("/api/checklists/runs/:id/reset", handle((a, req) => store.reset(a, id(req.params.id))));
  app.delete("/api/checklists/runs/:id", handle((a, req) => store.removeRun(a, id(req.params.id))));
  return store;
}
