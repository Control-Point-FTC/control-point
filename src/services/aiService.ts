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
    throw new Error(`AI request failed: ${res.status} ${text}`);
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

export async function getBuildHelper(messages: BuildHelperMessage[]) {
  try {
    const { result } = await postJSON('/api/ai/build-helper', { messages });
    return result || "Volt hit a snag — please try again in a moment.";
  } catch (error) {
    console.error('Error calling build helper:', error);
    return "Volt isn't reachable right now. Check your connection and try again.";
  }
}

export function streamBuildHelper(
  messages: BuildHelperMessage[],
  onChunk: (chunk: string) => void
) {
  return postStream('/api/ai/build-helper', { messages }, onChunk);
}
