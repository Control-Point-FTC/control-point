// First-party, cookieless pageview counter for the public pages only.
// Stores daily totals per page and nothing about the visitor: no cookies,
// no IP addresses, no user agents, no identifiers. Do Not Track and Global
// Privacy Control are honoured. Team pages are never counted.
import type express from "express";
import type { Client } from "@libsql/client";
import { dbClient } from "../db.js";

export const PUBLIC_PAGE_PATHS = ["/", "/privacy", "/terms", "/predict/how-it-works"] as const;
const RATE_LIMIT = 30, RATE_WINDOW_MS = 60_000;

/** The public page a path refers to (case and trailing slash ignored), or null. */
export function publicPagePath(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.length > 100) return null;
  const clean = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "") || "/";
  return (PUBLIC_PAGE_PATHS as readonly string[]).includes(clean) ? clean : null;
}

export function optedOut(headers: Record<string, unknown>): boolean {
  return headers["dnt"] === "1" || headers["sec-gpc"] === "1";
}

export class PageViews {
  // Short-lived, in memory only: who sent a lot just now (not stored).
  private recent = new Map<string, { count: number; since: number }>();
  constructor(private db: Client = dbClient) {
    // Addresses are forgotten within about a minute, even if no one else visits.
    setInterval(() => this.prune(), RATE_WINDOW_MS).unref?.();
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.recent) if (now - entry.since > RATE_WINDOW_MS) this.recent.delete(key);
  }

  /** How many addresses are remembered right now (for tests). */
  get remembered() { return this.recent.size; }

  allow(key: string, now = Date.now()): boolean {
    const entry = this.recent.get(key);
    if (!entry || now - entry.since > RATE_WINDOW_MS) { this.recent.set(key, { count: 1, since: now }); if (this.recent.size > 10_000) this.recent.clear(); return true; }
    entry.count++;
    return entry.count <= RATE_LIMIT;
  }

  async count(path: string, day = new Date().toISOString().slice(0, 10)) {
    await this.db.execute({ sql: "INSERT INTO page_views(day,path,views) VALUES(?,?,1) ON CONFLICT(day,path) DO UPDATE SET views=views+1", args: [day, path] });
  }

  async summary(days: number) {
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const rows = (await this.db.execute({ sql: "SELECT day,path,views FROM page_views WHERE day>=? ORDER BY day,path", args: [since] })).rows as unknown as { day: string; path: string; views: number }[];
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.path] = (totals[r.path] ?? 0) + Number(r.views);
    return { since, days: rows.map(r => ({ day: r.day, path: r.path, views: Number(r.views) })), totals };
  }
}

export function registerPageViewRoutes(app: express.Express, deps: { requireOwner: (req: any, res: any) => Promise<unknown>; views?: PageViews }) {
  const views = deps.views ?? new PageViews();
  app.post("/api/pv", async (req, res) => {
    res.status(204);
    const path = publicPagePath(req.body?.path);
    if (!path || optedOut(req.headers) || !views.allow(String(req.ip ?? ""))) return res.end();
    try { await views.count(path); } catch (e) { console.error("pageview count failed", e); }
    res.end();
  });
  app.get("/api/owner/pageviews", async (req, res) => {
    if (!await deps.requireOwner(req, res)) return;
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    res.json(await views.summary(days));
  });
  return views;
}

/** The Predict article is plain HTML: count real browser page loads of it. */
export function countArticleView(views: PageViews, req: express.Request) {
  if (req.headers["sec-fetch-mode"] !== "navigate" || req.headers["sec-fetch-dest"] !== "document" || optedOut(req.headers)) return;
  if (!views.allow(String(req.ip ?? ""))) return;
  void views.count("/predict/how-it-works").catch(e => console.error("pageview count failed", e));
}
