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

export interface ProposalContext { today: string; roster: string[] }

let ctx: ProposalContext | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export const getProposalContext = () => ctx;
/** Test hook. */
export function setProposalContext(c: ProposalContext | null) { ctx = c; listeners.forEach((l) => l()); }

export function loadProposalContext(): Promise<void> {
  if (ctx || loading) return loading || Promise.resolve();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  const run: Promise<void> = (async () => {
    try {
      const res = await apiFetch(`/api/ai/proposal-context${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`);
      const body = res.ok ? await res.json() : null;
      if (body && typeof body.today === 'string' && Array.isArray(body.roster)) setProposalContext({ today: body.today, roster: body.roster.map(String) });
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
