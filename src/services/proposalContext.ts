// Bruno confirm cards show each proposal exactly as it will be saved (V3.5
// phase 4). Tasks and events are resolved here, once, with the team's today
// and roster from the server: fields left in the text are read out
// (normalizeBrunoTask / recoverEventTime), names resolve to real members. The
// card shows the resolved items and Confirm sends those same items; the
// server saves them as they are.
import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from './api';
import { normalizeBrunoTask, normalizeTaskUpdate, recoverEventTime, type TeamRole } from '../utils/brunoTasks';
import type { ActionProposal } from './aiService';

export interface ProposalContext { today: string; roster: string[]; roles?: TeamRole[]; subsystems?: string[]; loadedAt?: number }

/** The roster and the team's date can change (a new member, midnight):
 *  a card mounting after this long refreshes them first. */
const MAX_AGE_MS = 60_000;
let ctx: ProposalContext | null = null;
let loading: Promise<void> | null = null;
/** Bumped on every reset (workspace switch): a request started before it
 *  must not install the old workspace's roster and date afterwards. */
let generation = 0;
const listeners = new Set<() => void>();

const install = (c: ProposalContext | null) => { ctx = c ? { ...c, loadedAt: c.loadedAt ?? Date.now() } : null; listeners.forEach((l) => l()); };
export const getProposalContext = () => ctx;
/** Reset (workspace switch) or set directly (tests). Drops any request in flight. */
export function setProposalContext(c: ProposalContext | null) {
  generation++;
  loading = null;
  taskIndex = null; taskIndexAt = 0; taskLoading = null; taskRequest++;
  install(c);
}

export function loadProposalContext(): Promise<void> {
  if (loading) return loading;
  if (ctx && Date.now() - (ctx.loadedAt || 0) < MAX_AGE_MS) return Promise.resolve();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  const gen = generation;
  const run: Promise<void> = (async () => {
    try {
      const res = await apiFetch(`/api/ai/proposal-context${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`);
      const body = res.ok ? await res.json() : null;
      if (gen !== generation) return;
      if (body && typeof body.today === 'string' && Array.isArray(body.roster)) install({
        today: body.today, roster: body.roster.map(String),
        roles: Array.isArray(body.roles) ? body.roles.filter((r: any) => typeof r?.name === 'string').map((r: any) => ({ name: r.name, members: Array.isArray(r.members) ? r.members.map(String) : [] })) : undefined,
        subsystems: Array.isArray(body.subsystems) ? body.subsystems.filter((s: unknown): s is string => typeof s === 'string') : undefined,
      });
    } catch { /* offline: cards show the explicit fields, which is also what saves */ }
    if (loading === run) loading = null;
  })();
  loading = run;
  return run;
}

/** Subscribe a confirm card to the context (it re-renders once it loads). */
export function useProposalContext(): ProposalContext | null {
  const c = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getProposalContext, getProposalContext);
  useEffect(() => { void loadProposalContext(); }, []);
  return c;
}

/** One task as it will be saved, plus names that matched no single member. */
export function resolveTaskItem(it: any) {
  const c = ctx;
  // Without the context only the explicit fields count, exactly as the server saves them.
  const t = normalizeBrunoTask(it, c?.today || '', c?.roster || [], { fromText: !!c, roles: c?.roles, subsystems: c?.subsystems });
  const names = [...(Array.isArray(it?.assignees) ? it.assignees : []), ...(typeof it?.assignee === 'string' ? [it.assignee] : [])];
  return {
    title: t.title, description: t.description, due_date: t.due_date, due_time: t.due_time, priority: t.priority,
    assignees: c ? t.assignees : names.filter(Boolean), repeat: t.recurrence, unmatched: c ? t.unmatched : [],
    roles: t.roles, unmatchedRoles: t.unmatchedRoles,
    start_date: t.start_date, subsystems: t.subsystems, awards: t.awards, labels: t.labels, completion_mode: t.completion_mode,
    // Who each role covers, for the card ("Builders: Ana, Lee").
    roleMembers: Object.fromEntries(t.roles.map((r) => [r, c?.roles ? (c.roles.find((x) => x.name === r)?.members ?? []) : null])) as Record<string, string[] | null>,
  };
}

export function resolveEventItem(it: any) {
  return ctx ? recoverEventTime({ ...it, title: String(it?.title || ''), notes: it?.notes ?? '', time: it?.time ?? '', end: it?.end ?? '' }) : it;
}

/** A task edit as it will be saved. Before the roster loads, names are kept
 *  as written and the server resolves them (an edit never loses its people). */
export function resolveTaskUpdate(it: any) {
  return normalizeTaskUpdate(it, ctx ? ctx.roster : null, ctx?.roles ?? null, ctx?.subsystems ?? null);
}

/** The team's tasks as they are now, so an update card names the real task
 *  (not the model's label) and says when it no longer exists. One request is
 *  shared by every card; any task change refetches it (or drops it when no
 *  card is open), so a cached copy is current. */
export type CurrentTask = { id: number; title: string; status: string };
let taskIndex: Map<number, CurrentTask> | null = null;
let taskIndexAt = 0;
let taskRequest = 0;
let taskLoading: Promise<void> | null = null;
let openUpdateCards = 0;
export const getTaskIndex = () => taskIndex;
export function setTaskIndex(tasks: CurrentTask[] | null) {
  taskRequest++; taskLoading = null; // a fetch already in flight must not overwrite this
  taskIndex = tasks ? new Map(tasks.map((t) => [t.id, t])) : null;
  taskIndexAt = tasks ? Date.now() : 0;
  listeners.forEach((l) => l());
}
/** `fresh` (tasks just changed) supersedes a request in flight; otherwise
 *  cards share the pending request or a copy fetched in the last minute. */
export function loadTaskIndex(fresh = false): Promise<void> {
  if (!fresh && taskLoading) return taskLoading;
  if (!fresh && taskIndex && Date.now() - taskIndexAt < MAX_AGE_MS) return Promise.resolve();
  const mine = ++taskRequest;
  const run = (async () => {
    try {
      const res = await apiFetch('/api/tasks');
      const body = res.ok ? await res.json() : null;
      if (mine !== taskRequest || !Array.isArray(body)) return;
      taskIndex = new Map(body.map((t: any) => [Number(t.id), { id: Number(t.id), title: String(t.title ?? ''), status: String(t.status ?? '') }]));
      taskIndexAt = Date.now();
      listeners.forEach((l) => l());
    } catch { /* offline: the card falls back to the task's number */ }
  })();
  taskLoading = run;
  void run.finally(() => { if (taskLoading === run) taskLoading = null; });
  return run;
}
/** Tasks changed (live update, Bruno apply): open cards refetch, others forget. */
export function invalidateTaskIndex() {
  if (openUpdateCards > 0) void loadTaskIndex(true);
  else { taskRequest++; taskLoading = null; taskIndex = null; taskIndexAt = 0; }
}
/** Re-render an update card once the team's tasks load (only while it still
 *  shows task details: pass false once it's applied or dismissed). */
export function useTaskIndex(enabled: boolean): Map<number, CurrentTask> | null {
  const idx = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getTaskIndex, getTaskIndex);
  useEffect(() => {
    if (!enabled) return;
    openUpdateCards++;
    void loadTaskIndex();
    return () => { openUpdateCards--; };
  }, [enabled]);
  return idx;
}

/** The items Confirm sends: the same resolution the card showed. */
export function resolveProposals(proposals: ActionProposal[]): ActionProposal[] {
  return proposals.map((p) => p.kind === 'task' ? { ...p, items: p.items.map(resolveTaskItem) }
    : p.kind === 'event' ? { ...p, items: p.items.map(resolveEventItem) }
    : p.kind === 'task-update' ? { ...p, items: p.items.map((it) => {
      const u = resolveTaskUpdate(it);
      return u ? { id: u.id, ...u.changes, ...(u.changes.recurrence !== undefined ? { repeat: u.changes.recurrence } : {}) } : null;
    }).filter(Boolean) } : p);
}
