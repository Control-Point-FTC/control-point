// Session-aware fetch helpers.
//
// The session id travels in the X-Session-ID header (the server also accepts
// it via query/body for backwards compatibility). Responses are parsed and
// normalized here so call sites don't repeat the same error handling.

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getStoredSessionId(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
  } catch {
    return null;
  }
}

/**
 * GitHub Pages mirror support: when the frontend is built with VITE_API_BASE
 * set, every API call, asset URL, and the WebSocket connection targets that
 * API origin instead of the page's own origin. Normal builds leave it unset
 * and everything stays same-origin.
 */
export function apiBase(): string {
  try {
    const b = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
    return (b || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** Prefix a root-relative API path with the API base when configured. Absolute URLs pass through. */
export function apiUrl(path: string): string {
  const base = apiBase();
  if (!base || /^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith('/') ? path : `/${path}`);
}

/** Asset URLs (avatars, uploads) are served by the API origin. */
export function assetUrl(url: string | null | undefined): string | null | undefined {
  if (typeof url !== 'string' || !url) return url;
  return apiUrl(url);
}

/**
 * OAuth start URL. In mirror builds the API completion must redirect back to
 * the mirror's app root, so the mirror origin+base-path rides along as
 * return_to (validated server-side against MIRROR_ORIGINS).
 */
export function oauthUrl(path: string): string {
  const base = apiBase();
  if (!base) return apiUrl(path);
  let returnTo = '';
  try {
    returnTo = new URL((import.meta as any).env.BASE_URL || '/', window.location.origin).href.replace(/\/$/, '');
  } catch { /* fall through without return_to */ }
  if (!returnTo) return apiUrl(path);
  const sep = path.includes('?') ? '&' : '?';
  return apiUrl(`${path}${sep}return_to=${encodeURIComponent(returnTo)}`);
}

export interface ApiFetchOptions extends RequestInit {
  /** Abort the request after this many ms. Opt-in; no default. */
  timeoutMs?: number;
}

/** Drop-in replacement for fetch: attaches X-Session-ID, supports timeoutMs. */
export function apiFetch(url: string, init: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  const headers = new Headers(rest.headers || undefined);
  const sid = getStoredSessionId();
  if (sid && !headers.has('X-Session-ID')) headers.set('X-Session-ID', sid);
  // Default to JSON for string bodies (JSON.stringify payloads). FormData /
  // Blob / URLSearchParams bodies are left alone — fetch sets their content
  // type automatically, and an explicit header is never overridden.
  if (typeof rest.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let signal = rest.signal;
  if (timeoutMs != null && !signal) {
    try {
      signal = AbortSignal.timeout(timeoutMs);
    } catch {
      /* older runtimes without AbortSignal.timeout — skip */
    }
  }
  return fetch(apiUrl(url), { ...rest, headers, signal: signal ?? undefined });
}

function handleUnauthorized() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('sessionId');
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cp:unauthorized'));
  }
}

/**
 * Fetch + parse JSON. Throws ApiError on non-2xx.
 * On 401 the stored session is cleared and a `cp:unauthorized` window event
 * is dispatched so the app can return to the signed-out state.
 */
export async function apiJson<T = any>(url: string, init: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, 'Session expired — please sign in again', body);
  }
  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export interface ApiGetOptions {
  retries?: number;
  timeoutMs?: number;
}

/**
 * GET with safe retries. Only idempotent GETs use this: retries happen on
 * network failures, 5xx, and 429 (with exponential backoff). Client errors
 * (including 401) are never retried. Never use for POST/PUT/PATCH/DELETE.
 */
export async function apiGet<T = any>(url: string, opts: ApiGetOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 15000;
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiJson<T>(url, { timeoutMs });
    } catch (e: any) {
      lastErr = e;
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 5000)));
    }
  }
  throw lastErr;
}
