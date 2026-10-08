// Bruno confirm cards show each proposal exactly as it will be saved (V3.5
// phase 4). Tasks and events are resolved here, once, with the team's today
// and roster from the server: fields left in the text are read out
// (normalizeBrunoTask / recoverEventTime), names resolve to real members. The
// card shows the resolved items and Confirm sends those same items; the
// server saves them as they are.
import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from './api';
import { normalizeBrunoTask, recoverEventTime } from '../utils/brunoTasks';
import type { ActionProposal } from './aiService';

export interface ProposalContext { today: string; roster: string[]; loadedAt?: number }

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
      if (body && typeof body.today === 'string' && Array.isArray(body.roster)) install({ today: body.today, roster: body.roster.map(String) });
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
  const t = normalizeBrunoTask(it, c?.today || '', c?.roster || [], { fromText: !!c });
  const names = [...(Array.isArray(it?.assignees) ? it.assignees : []), ...(typeof it?.assignee === 'string' ? [it.assignee] : [])];
  return {
    title: t.title, description: t.description, due_date: t.due_date, due_time: t.due_time, priority: t.priority,
    assignees: c ? t.assignees : names.filter(Boolean), repeat: t.recurrence, unmatched: c ? t.unmatched : [],
  };
}

export function resolveEventItem(it: any) {
  return ctx ? recoverEventTime({ ...it, title: String(it?.title || ''), notes: it?.notes ?? '', time: it?.time ?? '', end: it?.end ?? '' }) : it;
}

/** The items Confirm sends: the same resolution the card showed. */
export function resolveProposals(proposals: ActionProposal[]): ActionProposal[] {
  return proposals.map((p) => p.kind === 'task' ? { ...p, items: p.items.map(resolveTaskItem) }
    : p.kind === 'event' ? { ...p, items: p.items.map(resolveEventItem) } : p);
}
