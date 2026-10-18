// Client-side wrapper for Control Point's server-side AI endpoints.
// The API key lives on the server (GEMINI_API_KEY env var) — these calls only
// carry the user's session id, exactly like every other authenticated request.

import { apiFetch } from './api';
import { getScreenContext } from './brunoContext';
import type { ScoutingContextRequest } from '../types/ftcScout';
import { attachedMarker, BRUNO_REQUEST_LIMIT_BYTES } from '../utils/brunoFiles';

const CACHE_KEY = 'ftcNewsCache';
const TS_KEY = 'ftcNewsTimestamp';

/** The viewer's IANA timezone, so the server can state dates and weekdays in
 *  the team's local time when the workspace hasn't set one. */
function viewerTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}
const withTz = (body: any) => (body && typeof body === 'object' && !Array.isArray(body) ? { tz: viewerTimeZone(), ...body } : body);

async function postJSON(endpoint: string, body: any = {}) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTz(body))
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI request failed: ${res.status} ${text}`);
  }

  return res.json();
}

async function postStream(
  endpoint: string,
  body: any,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
) {
  const res = await apiFetch(`${endpoint}?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withTz(body)),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    let serverError = '';
    try { serverError = JSON.parse(text)?.error || ''; } catch { /* non-JSON body */ }
    const err: any = new Error(`AI request failed: ${res.status}`);
    err.status = res.status;
    err.serverError = serverError;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onChunk(decoder.decode()); // flush
}

export async function fetchFTCNews(force: boolean = false) {
  // keep the same localStorage caching logic that existed previously
  if (!force && typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(TS_KEY);
    if (cached && ts) {
      const age = Date.now() - parseInt(ts, 10);
      if (age < 24 * 60 * 60 * 1000) {
        return cached;
      }
    }
  }

  try {
    const { result } = await postJSON('/api/ai/fetch-news', { force });
    const value = result || 'No news found at the moment.';

    if (typeof localStorage !== 'undefined') {
      try {
        // Don't cache absurd payloads — keeps localStorage from filling up.
        if (value.length < 500_000) {
          localStorage.setItem(CACHE_KEY, value);
          localStorage.setItem(TS_KEY, Date.now().toString());
        }
      } catch { /* storage full — ignore */ }
    }

    return value;
  } catch (error) {
    console.error('Error fetching AI news:', error);
    return 'Failed to fetch latest news. Please check your connection.';
  }
}

// JSON feed variant for the visual AI Scout feed (cards, not a text roundup)
const FEED_CACHE_KEY = 'ftcScoutFeedCache';
const FEED_TS_KEY = 'ftcScoutFeedTimestamp';

export interface ScoutFeedItem {
  category: string;
  title: string;
  summary: string;
  source: string;
  url: string;
}

export async function fetchScoutFeed(force: boolean = false): Promise<{ items: ScoutFeedItem[]; cached?: boolean }> {
  if (!force && typeof localStorage !== 'undefined') {
    try {
      const cached = localStorage.getItem(FEED_CACHE_KEY);
      const ts = localStorage.getItem(FEED_TS_KEY);
      if (cached && ts && Date.now() - parseInt(ts, 10) < 24 * 60 * 60 * 1000) {
        const items = JSON.parse(cached);
        if (Array.isArray(items)) return { items, cached: true };
      }
    } catch { /* fall through to network */ }
  }
  const data = await postJSON('/api/ai/scout-feed', { force });
  const items: ScoutFeedItem[] = Array.isArray(data.items) ? data.items : [];
  if (typeof localStorage !== 'undefined') {
    try {
      const serialized = JSON.stringify(items);
      if (serialized.length < 500_000) {
        localStorage.setItem(FEED_CACHE_KEY, serialized);
        localStorage.setItem(FEED_TS_KEY, Date.now().toString());
      }
    } catch { /* storage full — ignore */ }
  }
  return { items, cached: !!data.cached };
}

// streaming variant using fetch body's readable stream
export function streamFTCNews(
  force: boolean = false,
  onChunk: (chunk: string) => void
) {
  return postStream('/api/ai/fetch-news', { force }, onChunk);
}

export async function getAttendanceInsights(records: any[], members: any[]) {
  try {
    const { result } = await postJSON('/api/ai/attendance', { records, members });
    return result || 'No insights available.';
  } catch (error) {
    console.error('Error getting insights:', error);
    return 'Insights unavailable.';
  }
}

export function streamAttendanceInsights(
  records: any[],
  members: any[],
  onChunk: (chunk: string) => void
) {
  return postStream('/api/ai/attendance', { records, members }, onChunk);
}

export async function checkExcuse(reason: string, criteria: string) {
  try {
    const { result } = await postJSON('/api/ai/check-excuse', { reason, criteria });
    return result || 'UNEXCUSED - AI failed to analyze.';
  } catch (error) {
    console.error('Error checking excuse:', error);
    return 'UNEXCUSED - AI error.';
  }
}

export function streamCheckExcuse(
  reason: string,
  criteria: string,
  onChunk: (chunk: string) => void
) {
  return postStream('/api/ai/check-excuse', { reason, criteria }, onChunk);
}

export async function getActivitySummary(data: any) {
  try {
    const { result } = await postJSON('/api/ai/activity-summary', data);
    return result || 'No summary available.';
  } catch (error) {
    console.error('Error getting activity summary:', error);
    return 'Summary unavailable.';
  }
}

export function streamActivitySummary(
  data: any,
  onChunk: (chunk: string) => void
) {
  return postStream('/api/ai/activity-summary', data, onChunk);
}

export interface BuildHelperMessage {
  role: 'user' | 'model';
  /** Never capped. Text and code files are part of it (src/utils/brunoFiles.ts). */
  text: string;
  /** Images attached to a user message in this session (sent with it once;
      a saved chat keeps them on the server, see /api/ai/build-helper). */
  images?: { mimeType: string; data: string; name?: string }[];
  /** PDFs attached to a user message in this session: same handling. */
  pdfs?: { mimeType: string; data: string; name: string }[];
  /** Images and PDFs saved with the message, from a loaded chat. */
  saved?: { id: number; name: string; mimeType: string; size: number; url: string }[];
}

/** How many recent messages the server reads (it ignores older ones). */
export const BRUNO_HISTORY_TURNS = 12;

/** The conversation as the server takes it: role and text only, the turns
 *  it reads, within the provider's request size (oldest dropped first, the
 *  current message never). Earlier messages' images and PDFs aren't sent
 *  again; their "📎 Attached:" line tells the model they were there (a
 *  loaded chat's text already has it). */
export function historyForServer(messages: BuildHelperMessage[], fileBytes = 0): { role: 'user' | 'model'; text: string }[] {
  const last = messages.map((m) => m.role).lastIndexOf('user');
  const all = messages.map((m, i) => {
    const names = [...(m.images || []).map((im, k) => im.name || `image-${k + 1}.jpg`), ...(m.pdfs || []).map((p) => p.name)];
    const marker = i !== last && names.length && !/📎 Attached: /.test(m.text) ? attachedMarker(names) : '';
    return { role: m.role, text: marker ? `${m.text}\n\n${marker}` : m.text };
  }).slice(-BRUNO_HISTORY_TURNS);
  if (!all.length) return all;
  const bytes = (t: string) => new TextEncoder().encode(t).length;
  let budget = BRUNO_REQUEST_LIMIT_BYTES - fileBytes - bytes(all[all.length - 1].text);
  const kept = [all[all.length - 1]];
  for (let i = all.length - 2; i >= 0; i--) {
    const b = bytes(all[i].text);
    if (b > budget) break;
    kept.unshift(all[i]);
    budget -= b;
  }
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  return kept;
}

/** Remove ```event / ```delete-event / ```outreach blocks (complete or still streaming) from displayed Bruno text. */
import { stripNotebookBlocks } from "./notebookProposals";

export function stripEventBlocks(text: string): string {
  // Notebook blocks first: their JSON may quote other fences inside strings.
  return stripNotebookBlocks(String(text || "")).replace(/```event[\s\S]*?(```|$)/g, "").replace(/```delete-event[\s\S]*?(```|$)/g, "").replace(/```outreach[\s\S]*?(```|$)/g, "").replace(/```tasks[\s\S]*?(```|$)/g, "").replace(/```task-update[\s\S]*?(```|$)/g, "").replace(/```budget[\s\S]*?(```|$)/g, "").replace(/```communications[\s\S]*?(```|$)/g, "").replace(/```switch[\s\S]*?(```|$)/g, "").replace(/```workspace[\s\S]*?(```|$)/g, "").replace(/```task-comment[\s\S]*?(```|$)/g, "").replace(/```event-rsvp[\s\S]*?(```|$)/g, "").replace(/```away[\s\S]*?(```|$)/g, "").replace(/```checklist[\s\S]*?(```|$)/g, "").replace(/```appearance[\s\S]*?(```|$)/g, "").replace(/```parts[\s\S]*?(```|$)/g, "")
    // Scouting lookup requests: the server runs them and appends the results.
    .replace(/```lookup[\s\S]*?(```|$)/g, "").replace(/```remember[\s\S]*?(```|$)/g, "").replace(/```scout-team[\s\S]*?(```|$)/g, "").replace(/```scout-event[\s\S]*?(```|$)/g, "").trim();
}

/**
 * Parse Bruno/NavGPT data-action proposal blocks from raw reply text into
 * structured proposals for the confirm card. The AI only proposes — nothing
 * is inserted until the user taps confirm, which POSTs to /api/ai/apply-actions.
 * Light client-side validation; the server re-validates strictly on apply.
 */
export interface ActionProposal {
  kind: 'event' | 'delete-event' | 'outreach' | 'task' | 'task-update' | 'budget' | 'communication' | 'workspace' | 'task-comment' | 'event-rsvp' | 'away' | 'checklist' | 'part';
  items: any[];
}

const ACTION_BLOCK_RES: Record<ActionProposal['kind'], RegExp> = {
  event: /```event\s*\r?\n([\s\S]*?)\r?\n```/,
  'delete-event': /```delete-event\s*\r?\n([\s\S]*?)\r?\n```/,
  outreach: /```outreach\s*\r?\n([\s\S]*?)\r?\n```/,
  task: /```tasks\s*\r?\n([\s\S]*?)\r?\n```/,
  // Edits to existing tasks (by #id), never new ones.
  'task-update': /```task-update\s*\r?\n([\s\S]*?)\r?\n```/,
  budget: /```budget\s*\r?\n([\s\S]*?)\r?\n```/,
  communication: /```communications\s*\r?\n([\s\S]*?)\r?\n```/,
  // Module switches and robot subsystems (one change object).
  workspace: /```workspace\s*\r?\n([\s\S]*?)\r?\n```/,
  // Comments on existing tasks (by #id).
  'task-comment': /```task-comment\s*\r?\n([\s\S]*?)\r?\n```/,
  // The member's own RSVP answers (by event #id).
  'event-rsvp': /```event-rsvp\s*\r?\n([\s\S]*?)\r?\n```/,
  // The member's own unavailable times (new ones, or {"remove": id}).
  away: /```away\s*\r?\n([\s\S]*?)\r?\n```/,
  // Checklist runs to start, or items to check off on an open run.
  checklist: /```checklist\s*\r?\n([\s\S]*?)\r?\n```/,
  // Lines for the CAD Parts List.
  part: /```parts\s*\r?\n([\s\S]*?)\r?\n```/,
};

function parseActionBlock(kind: ActionProposal['kind'], raw: string): any[] {
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (kind === 'delete-event') {
      // Deletions are id-only; drop anything without a valid positive integer id.
      return arr
        .map((it: any) => {
          const id = typeof it?.id === 'number' ? it.id : parseInt(it?.id);
          return Number.isInteger(id) && id > 0 ? { id, title: typeof it?.title === 'string' ? it.title : '', date: typeof it?.date === 'string' ? it.date : '' } : null;
        })
        .filter(Boolean)
        .slice(0, 20);
    }
    return arr.filter((it: any) => it && typeof it === 'object').slice(0, 20);
  } catch {
    return [];
  }
}

export function extractActionProposals(text: string): ActionProposal[] {
  const t = String(text || "");
  const proposals: ActionProposal[] = [];
  (Object.keys(ACTION_BLOCK_RES) as ActionProposal['kind'][]).forEach((kind) => {
    // Several blocks of one kind (long pasted notes) become one group.
    const re = new RegExp(ACTION_BLOCK_RES[kind].source, 'g');
    const items = [...t.matchAll(re)].flatMap((m) => parseActionBlock(kind, m[1])).slice(0, 20);
    if (items.length) proposals.push({ kind, items });
  });
  return proposals;
}

/**
 * Confirm + apply proposed data actions. Returns the server's applied counts.
 * Throws on permission/validation errors with a human-readable message.
 */
export async function applyActionProposals(actions: ActionProposal[]): Promise<Record<string, number>> {
  return (await applyActionProposalsWithIds(actions)).applied;
}

/** The same, also returning the new records' ids per kind (for "View task" links). */
export async function applyActionProposalsWithIds(actions: ActionProposal[]): Promise<{ applied: Record<string, number>; created: Record<string, number[]> }> {
  // Send exactly what the confirm card showed (see proposalContext).
  const { resolveProposals } = await import('./proposalContext');
  const { ok, applied, created, error } = await postJSON('/api/ai/apply-actions', { actions: resolveProposals(actions) });
  if (!ok) throw new Error(error || "Couldn't save those — please try again");
  return { applied: applied || {}, created: created || {} };
}

/**
 * NavGPT coding handoff: detect a fenced ```switch block the model emitted.
 * Returns the display text (block stripped) plus the handoff target, if any.
 * Works mid-stream too — a partial block is treated as "no switch yet".
 */
export function stripSwitchBlock(text: string): { text: string; switchTo: string | null } {
  const src = String(text || "");
  const m = src.match(/```switch\s*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) return { text: src, switchTo: null };
  let switchTo: string | null = null;
  try {
    const p = JSON.parse(m[1]);
    if (p && p.to === "bruno") switchTo = "bruno";
  } catch { /* malformed — ignore */ }
  return { text: src.replace(/```switch[\s\S]*?(```|$)/g, "").trim(), switchTo };
}

/**
 * Detect which team-data actions Bruno performed from its reply text.
 * Works on both raw streamed text (contains the fenced ```event / ```outreach
 * blocks the server is inserting) and final non-streamed text (contains the
 * server's 📅 / 📣 confirmation lines).
 */
export function detectBrunoDataActions(text: string): string[] {
  const t = String(text || "");
  const types: string[] = [];
  if (/```event[\s\S]*?```/.test(t) || t.includes("📅 Added to the team calendar:")) types.push("calendar");
  if (/```outreach[\s\S]*?```/.test(t) || /📣 Logged (\d+ )?outreach events?:/.test(t)) types.push("outreach");
  if (/```tasks[\s\S]*?```/.test(t)) types.push("tasks");
  if (/```budget[\s\S]*?```/.test(t)) types.push("budget");
  if (/```communications[\s\S]*?```/.test(t)) types.push("communications");
  if (/```workspace[\s\S]*?```/.test(t)) types.push("workspace");
  return types;
}

/**
 * Event-driven invalidation: tell subscribed views (calendar, outreach,
 * dashboard) that Bruno changed team data so they refetch without a reload.
 * No polling — a single CustomEvent the app shell listens for.
 */
export function notifyBrunoDataChanged(types: string[]) {
  if (!types.length || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bruno-data-changed", { detail: { types } }));
}

export async function getBuildHelper(messages: BuildHelperMessage[], chatId?: number) {
  try {
    const history = historyForServer(messages);
    const { result } = await postJSON('/api/ai/build-helper', chatId ? { messages: history, chatId } : { messages: history });
    return result || "Bruno hit a snag — please try again in a moment.";
  } catch (error) {
    console.error('Error calling build helper:', error);
    return "Bruno isn't reachable right now. Check your connection and try again.";
  }
}

export function streamBuildHelper(
  messages: BuildHelperMessage[],
  onChunk: (chunk: string) => void,
  chatId?: number,
  opts?: { persona?: string; scouting?: ScoutingContextRequest; signal?: AbortSignal }
) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const fileBytes = [...(lastUser?.images || []), ...(lastUser?.pdfs || [])].reduce((n, f) => n + f.data.length, 0);
  const history = historyForServer(messages, fileBytes);
  const body: any = chatId ? { messages: history, chatId } : { messages: history };
  if (opts?.persona) body.persona = opts.persona;
  // Analyze mode: only identifiers travel; the server builds the scouting pack.
  if (opts?.scouting) body.scouting = opts.scouting;
  // What the user is looking at (page + open record) rides along with every message.
  const screen = getScreenContext();
  if (screen) body.screen = screen;
  // Images and PDFs ride on the latest user message, whole: the server
  // checks them against the provider's request size and sends them on.
  if (lastUser?.images?.length) {
    body.images = lastUser.images
      .filter((im) => im && typeof im.mimeType === 'string' && typeof im.data === 'string')
      .map((im, i) => ({ mimeType: im.mimeType, data: im.data, name: im.name || `image-${i + 1}.jpg` }));
  }
  if (lastUser?.pdfs?.length) {
    body.pdfs = lastUser.pdfs
      .filter((p) => p && p.mimeType === 'application/pdf' && typeof p.data === 'string')
      .map((p) => ({ mimeType: 'application/pdf', data: p.data, name: String(p.name || 'document.pdf') }));
  }
  // `signal` lets the user stop a reply mid-stream (Modern "Stop" button).
  return postStream('/api/ai/build-helper', body, onChunk, opts?.signal);
}
