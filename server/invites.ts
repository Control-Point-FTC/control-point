/**
 * Workspace join links ("invites").
 *
 * A link is `/join/<token>`. The token is 24 random bytes (base64url); only
 * its SHA-256 hash is stored, plus a short hint so a list of links can be
 * told apart. A link can be revoked, can expire, and can cap its uses. When
 * it requires approval, using it files a join request instead of adding the
 * person straight away.
 */
import crypto from "crypto";

export const INVITE_TOKEN_PREFIX = "cpi_";

export function newInviteToken(): string {
  return INVITE_TOKEN_PREFIX + crypto.randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A shape check before touching the database (also bounds the input). */
export function looksLikeInviteToken(token: unknown): token is string {
  return typeof token === "string" && /^cpi_[A-Za-z0-9_-]{20,64}$/.test(token);
}

export function inviteHint(token: string): string {
  return token.slice(-4);
}

export interface InviteRow {
  id: number;
  team_id: number;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  requires_approval: number;
  revoked_at: string | null;
}

export type InviteState = "active" | "revoked" | "expired" | "used_up";

/** SQLite datetime('now') text is UTC without a zone marker. */
function parseDbTime(s: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
}

export function inviteState(inv: InviteRow, now = Date.now()): InviteState {
  if (inv.revoked_at) return "revoked";
  if (inv.expires_at && parseDbTime(inv.expires_at) <= now) return "expired";
  if (inv.max_uses != null && inv.uses >= inv.max_uses) return "used_up";
  return "active";
}

export const INVITE_STATE_MESSAGE: Record<Exclude<InviteState, "active">, string> = {
  revoked: "This invite link was turned off. Ask your team for a new one.",
  expired: "This invite link has expired. Ask your team for a new one.",
  used_up: "This invite link has been used the maximum number of times. Ask your team for a new one.",
};

/** Allowed expiry choices (hours; null = never). */
export const INVITE_EXPIRY_HOURS = [1, 24, 24 * 7, 24 * 30, null] as const;
export const INVITE_MAX_USES = [1, 5, 10, 25, 50, 100, null] as const;

/** Validates the create-link body. Returns an error message or the settings. */
export function parseInviteOptions(body: any, now = Date.now()):
  | { error: string }
  | { expiresAt: string | null; maxUses: number | null; requiresApproval: boolean; label: string | null } {
  const b = body || {};
  const hours = b.expires_in_hours === undefined ? 24 * 7 : b.expires_in_hours;
  if (!(INVITE_EXPIRY_HOURS as readonly (number | null)[]).includes(hours)) return { error: "Choose how long the link should work" };
  const uses = b.max_uses === undefined ? null : b.max_uses;
  if (!(INVITE_MAX_USES as readonly (number | null)[]).includes(uses)) return { error: "Choose how many people can use the link" };
  const label = typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 60) : null;
  return {
    expiresAt: hours == null ? null : new Date(now + hours * 3600_000).toISOString(),
    maxUses: uses,
    requiresApproval: b.requires_approval === true,
    label,
  };
}
