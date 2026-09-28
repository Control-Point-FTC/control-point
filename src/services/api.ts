// Session-aware fetch: attaches the stored session id so the API can
// identify the caller and scope every response to their workspace.
export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const sid =
    typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
  const sep = url.includes('?') ? '&' : '?';
  const authed = sid ? `${url}${sep}sessionId=${encodeURIComponent(sid)}` : url;
  return fetch(authed, init);
}
