// Workspace join links: /join/<token>. A link opened while signed out is
// kept for this tab so it survives sign-in, sign-up, email verification and
// an OAuth round trip, then used once the person is signed in.
import { apiFetch } from '../../../services/api';

const KEY = 'cp-pending-invite';
const TOKEN_RE = /cpi_[A-Za-z0-9_-]{20,64}/;

/** The token in a /join/<token> path, if any. */
export function inviteTokenFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/join\/(cpi_[A-Za-z0-9_-]{20,64})\/?$/);
  return m ? m[1] : null;
}

/** The token in a pasted link (or a bare token), if any. */
export function inviteTokenFromText(text: string): string | null {
  const m = String(text || '').match(TOKEN_RE);
  return m ? m[0] : null;
}

export function stashInvite(token: string) {
  try { sessionStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
}

export function peekInvite(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearInvite() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export interface InvitePreview {
  team: { name: string; number: string | null };
  requires_approval: boolean;
  state: 'active' | 'revoked' | 'expired' | 'used_up';
  message: string | null;
}

export async function fetchInvitePreview(token: string): Promise<InvitePreview> {
  const res = await apiFetch(`/api/invites/preview/${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'That invite link isn’t valid — ask your team for a new one');
  return data;
}

/**
 * Join with whatever the person pasted: an invite link (or token) or an
 * access code. Resolves with the server response: `{ user, sessionId, team,
 * joined }`, or `{ pendingApproval, team }` for links that need approval.
 */
export async function joinWithCodeOrLink(input: string): Promise<any> {
  const token = inviteTokenFromText(input);
  const res = await apiFetch(token ? '/api/invites/accept' : '/api/teams/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { token } : { access_code: input.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not join that workspace');
  return data;
}
