// Client-side wrapper for Control Point's server-side AI endpoints.
// The API key lives on the server (GEMINI_API_KEY env var) — these calls only
// carry the user's session id, exactly like every other authenticated request.

import { apiFetch } from './api';

const CACHE_KEY = 'ftcNewsCache';
const TS_KEY = 'ftcNewsTimestamp';

async function postJSON(endpoint: string, body: any = {}) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
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
  onChunk: (chunk: string) => void
) {
  const res = await apiFetch(`${endpoint}?stream=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
      localStorage.setItem(CACHE_KEY, value);
      localStorage.setItem(TS_KEY, Date.now().toString());
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
      localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(items));
      localStorage.setItem(FEED_TS_KEY, Date.now().toString());
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
  text: string;
}

/** Remove ```event / ```outreach blocks (complete or still streaming) from displayed Bruno text. */
export function stripEventBlocks(text: string): string {
  return String(text || "").replace(/```event[\s\S]*?(```|$)/g, "").replace(/```outreach[\s\S]*?(```|$)/g, "").replace(/```tasks[\s\S]*?(```|$)/g, "").replace(/```budget[\s\S]*?(```|$)/g, "").replace(/```switch[\s\S]*?(```|$)/g, "").trim();
}

/**
 * Parse Bruno/NavGPT data-action proposal blocks from raw reply text into
 * structured proposals for the confirm card. The AI only proposes — nothing
 * is inserted until the user taps confirm, which POSTs to /api/ai/apply-actions.
 * Light client-side validation; the server re-validates strictly on apply.
 */
export interface ActionProposal {
  kind: 'event' | 'outreach' | 'task' | 'budget';
  items: any[];
}

const ACTION_BLOCK_RES: Record<ActionProposal['kind'], RegExp> = {
  event: /```event\s*\r?\n([\s\S]*?)\r?\n```/,
  outreach: /```outreach\s*\r?\n([\s\S]*?)\r?\n```/,
  task: /```tasks\s*\r?\n([\s\S]*?)\r?\n```/,
  budget: /```budget\s*\r?\n([\s\S]*?)\r?\n```/,
};

function parseActionBlock(kind: ActionProposal['kind'], raw: string): any[] {
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.filter((it: any) => it && typeof it === 'object').slice(0, 20);
  } catch {
    return [];
  }
}

export function extractActionProposals(text: string): ActionProposal[] {
  const t = String(text || "");
  const proposals: ActionProposal[] = [];
  (Object.keys(ACTION_BLOCK_RES) as ActionProposal['kind'][]).forEach((kind) => {
    const m = t.match(ACTION_BLOCK_RES[kind]);
    if (!m) return;
    const items = parseActionBlock(kind, m[1]);
    if (items.length) proposals.push({ kind, items });
  });
  return proposals;
}

/**
 * Confirm + apply proposed data actions. Returns the server's applied counts.
 * Throws on permission/validation errors with a human-readable message.
 */
export async function applyActionProposals(actions: ActionProposal[]): Promise<Record<string, number>> {
  const { ok, applied, error } = await postJSON('/api/ai/apply-actions', { actions });
  if (!ok) throw new Error(error || "Couldn't save those — please try again");
  return applied || {};
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
    const { result } = await postJSON('/api/ai/build-helper', chatId ? { messages, chatId } : { messages });
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
  opts?: { persona?: string }
) {
  const body: any = chatId ? { messages, chatId } : { messages };
  if (opts?.persona) body.persona = opts.persona;
  return postStream('/api/ai/build-helper', body, onChunk);
}
