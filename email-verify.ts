// Email verification for email+password signups (email-verify.ts).
//
// Why this exists: OAuth signups (Google/Discord/GitHub) prove email ownership
// via the provider, but a plain email+password signup does not. Until the
// address is verified, the account gets NO session and cannot use the app.
//
// Design: 6-digit OTP code (not a magic link) —
//   1. Works cross-device (sign up on laptop, read code on phone).
//   2. No single-use-link prefetch pitfalls from email scanners.
//   3. One simple in-app screen: type the code, you're in.
//
// Sending goes through Resend's REST API (no new npm dependency — plain
// fetch). Configure with RESEND_API_KEY + EMAIL_FROM in the environment.
// Without a key, codes are logged to the server console so local dev and
// tests still work; production needs the key or nobody new can sign up.

import crypto from "crypto";
import { dbGet, dbAll, dbRun } from "./db.js";

export const VERIFY_CODE_TTL_MINUTES = 15;
export const VERIFY_MAX_ATTEMPTS = 5;
export const VERIFY_RESEND_COOLDOWN_SECONDS = 60;

/** Last email send outcome, for the owner console's health card. */
export type EmailHealth = { configured: boolean; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null };
const emailHealth: Omit<EmailHealth, "configured"> = { lastOkAt: null, lastError: null, lastErrorAt: null };
export function getEmailHealth(): EmailHealth {
  return { configured: isEmailConfigured(), ...emailHealth };
}
function recordEmailResult(error: string | null) {
  const now = new Date().toISOString();
  if (error) { emailHealth.lastError = error.slice(0, 300); emailHealth.lastErrorAt = now; }
  else emailHealth.lastOkAt = now;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function emailFrom(): string {
  return process.env.EMAIL_FROM || "Control Point <verify@control-point.app>";
}

export function generateCode(): string {
  // 6 digits, cryptographically random, no leading-zero issue.
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Email templates (2026 redesign, phase 9d). Table-based layout with inline
// styles so it renders the same in Gmail, Outlook and Apple Mail: a light card
// with the Control Point mark, a hidden preheader (the inbox preview line),
// the message, an optional code or button, and a footer that says why the
// email was sent. Every dynamic value is escaped. Classic Outlook ignores
// max-width, so a fixed 520px ghost table (Outlook-only) keeps it compact.
// ---------------------------------------------------------------------------

const BRAND = "#ffc700";
const INK = "#09090b";
const MUTED = "#52525b";
const FAINT = "#a1a1aa";
const LINE = "#e4e4e7";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Public app address for links in emails (APP_URL, else the production site). */
export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || "https://tryctrlpoint.org").replace(/\/$/, "");
  return `${base}${path}`;
}

export interface EmailParts {
  /** Inbox preview text, plain (escaped here). */
  preheader: string;
  /** Plain (escaped here). */
  title: string;
  /** Already-escaped HTML. */
  intro: string;
  /** Already-escaped HTML placed under the intro (a code, a task card…). */
  body?: string;
  cta?: { label: string; href: string };
  /** Plain text: why this email was sent (escaped here). */
  footnote: string;
}

export function emailTemplate({ preheader, title, intro, body = "", cta, footnote }: EmailParts): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;"><tr><td style="border-radius:10px;background:${INK};">
<a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)} &rarr;</a>
</td></tr></table>`
    : "";
  const site = appUrl();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="520" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="width:28px;height:28px;border-radius:8px;background:${BRAND};text-align:center;vertical-align:middle;font-family:${FONT};font-size:12px;font-weight:800;color:${INK};">CP</td>
<td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK};">Control Point</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px 28px;">
<div style="height:4px;width:44px;border-radius:4px;background:${BRAND};margin:0 0 20px;font-size:0;line-height:0;">&nbsp;</div>
<h1 style="margin:0 0 10px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(title)}</h1>
<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${MUTED};">${intro}</p>
${body}
${button}
</td></tr>
<tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">
${escapeHtml(footnote)}<br><a href="${escapeHtml(site)}" style="color:${FAINT};text-decoration:underline;">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a> &middot; Mission control for robotics teams
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}

/** A six-digit code as separate tiles (easy to read, easy to type). */
function codeTiles(code: string): string {
  const cells = escapeHtml(code).split("").map((d) =>
    `<td style="width:44px;height:54px;border:1px solid ${LINE};border-radius:10px;background:#fafafa;text-align:center;vertical-align:middle;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:26px;font-weight:700;color:${INK};">${d}</td>`
  ).join(`<td style="width:6px;"></td>`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr>${cells}</tr></table>`;
}

export type CodePurpose = "verify" | "reset";

export function verificationEmailHtml(code: string): string {
  return emailTemplate({
    preheader: `Your code is ${code}. It expires in ${VERIFY_CODE_TTL_MINUTES} minutes.`,
    title: "Confirm your email",
    intro: `Enter this code in Control Point to finish creating your account. It expires in ${VERIFY_CODE_TTL_MINUTES} minutes.`,
    body: codeTiles(code),
    footnote: "You're getting this because someone signed up for Control Point with this address. If it wasn't you, ignore this email and no account will be created.",
  });
}

export function resetEmailHtml(code: string): string {
  return emailTemplate({
    preheader: `Your password reset code is ${code}.`,
    title: "Reset your password",
    intro: `Enter this code in Control Point, then choose a new password. It expires in ${VERIFY_CODE_TTL_MINUTES} minutes.`,
    body: codeTiles(code),
    footnote: "You're getting this because a password reset was requested for this address. If it wasn't you, ignore this email; your password stays the same.",
  });
}

export async function sendVerificationEmail(to: string, code: string, purpose: CodePurpose = "verify"): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Dev/test fallback: no email provider configured.
    console.log(`[email-verify] (no RESEND_API_KEY) ${purpose} code for ${to}: ${code}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [to],
      subject: purpose === "reset" ? `Your Control Point password reset code: ${code}` : `Your Control Point verification code: ${code}`,
      html: purpose === "reset" ? resetEmailHtml(code) : verificationEmailHtml(code),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = `Email send failed (${res.status}): ${body.slice(0, 200)}`;
    recordEmailResult(err);
    throw new Error(err);
  }
  recordEmailResult(null);
}

/** Is this address already verified (account-wide, by email)? */
export async function isEmailVerified(email: string): Promise<boolean> {
  const row = (await dbGet("SELECT email FROM verified_emails WHERE LOWER(email) = LOWER(?)", email)) as any;
  return Boolean(row);
}

export async function markEmailVerified(email: string): Promise<void> {
  const normalized = String(email || "").trim().toLowerCase();
  await dbRun(
    "INSERT INTO verified_emails (email, verified_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
    normalized,
    new Date().toISOString()
  );
  // Consume any outstanding codes for this address.
  await dbRun("DELETE FROM email_verification_codes WHERE email = ?", normalized);
}

function codeExpiry(): string {
  return new Date(Date.now() + VERIFY_CODE_TTL_MINUTES * 60 * 1000).toISOString();
}

/**
 * Issue a fresh code for this email. Enforces the resend cooldown.
 * Returns { cooldownSeconds } when the caller must wait, otherwise sends.
 *
 * Timestamps are ISO-8601 UTC strings written from JS (never SQLite
 * datetime('now')): SQLite's UTC-without-timezone format parses as *local*
 * time in JS, which skews expiry/cooldown by the server's UTC offset.
 */
export async function issueVerificationCode(email: string, purpose: CodePurpose = "verify"): Promise<{ sent: true } | { sent: false; cooldownSeconds: number }> {
  const normalized = String(email || "").trim().toLowerCase();
  const recent = (await dbGet(
    "SELECT created_at FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
    normalized
  )) as any;
  if (recent?.created_at) {
    const ageSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    const wait = VERIFY_RESEND_COOLDOWN_SECONDS - ageSec;
    if (wait > 0) return { sent: false, cooldownSeconds: Math.ceil(wait) };
  }
  // Invalidate older outstanding codes; only the newest is valid.
  await dbRun("DELETE FROM email_verification_codes WHERE email = ?", normalized);
  const code = generateCode();
  const nowIso = new Date().toISOString();
  await dbRun(
    "INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)",
    normalized,
    hashCode(code),
    codeExpiry(),
    nowIso
  );
  try {
    await sendVerificationEmail(normalized, code, purpose);
  } catch (e) {
    // A code that never left must not hold the resend cooldown: drop it so
    // "Resend" works straight away instead of after a minute of nothing.
    await dbRun("DELETE FROM email_verification_codes WHERE email = ? AND created_at = ?", normalized, nowIso);
    throw e;
  }
  return { sent: true };
}

export type CodeCheck = { ok: true } | { ok: false; reason: "expired" | "invalid" | "locked" };

/**
 * Shared guess check. Every guess first reserves one attempt with a single
 * conditional UPDATE (`attempts < max`), so overlapping requests can never
 * share a counted attempt: at most VERIFY_MAX_ATTEMPTS guesses are ever
 * compared against a code, however many arrive at once.
 */
async function checkGuess(email: string, code: string): Promise<{ result: CodeCheck; rowId?: number }> {
  const normalized = String(email || "").trim().toLowerCase();
  const row = (await dbGet(
    "SELECT id, code_hash, expires_at FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
    normalized
  )) as any;
  if (!row) return { result: { ok: false, reason: "invalid" } };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
    return { result: { ok: false, reason: "expired" } };
  }
  // Reserve the attempt atomically before comparing.
  const reserved = await dbRun(
    "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ?",
    row.id, VERIFY_MAX_ATTEMPTS
  );
  if (!reserved.changes) {
    await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
    return { result: { ok: false, reason: "locked" } };
  }
  const guess = hashCode(String(code || "").trim());
  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(guess, "hex");
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (match) return { result: { ok: true }, rowId: row.id };
  const now = (await dbGet("SELECT attempts FROM email_verification_codes WHERE id = ?", row.id)) as any;
  if (!now || now.attempts >= VERIFY_MAX_ATTEMPTS) {
    await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
    return { result: { ok: false, reason: "locked" } };
  }
  return { result: { ok: false, reason: "invalid" } };
}

/** Validate a submitted code. Wrong guesses are counted; too many locks the code. */
export async function checkVerificationCode(email: string, code: string): Promise<CodeCheck> {
  return (await checkGuess(email, code)).result;
}

/**
 * Validate AND atomically consume a code. The DELETE is the atomic gate:
 * two overlapping requests with the same code can't both delete the row —
 * the loser gets 0 changes and fails. Use this (not checkVerificationCode)
 * when a successful check must immediately invalidate the code, e.g.
 * password reset.
 */
export async function consumeVerificationCode(email: string, code: string): Promise<CodeCheck> {
  const { result, rowId } = await checkGuess(email, code);
  if (!result.ok || rowId == null) return result;
  const del = await dbRun("DELETE FROM email_verification_codes WHERE id = ?", rowId);
  if (!del.changes) return { ok: false, reason: "invalid" };
  return { ok: true };
}

/** Test helper: read the latest code hash for an email (never the code itself). */
export async function latestCodeRow(email: string): Promise<any> {
  return dbGet("SELECT id, expires_at, attempts FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1", email);
}

export async function pendingCodeCount(email: string): Promise<number> {
  const rows = (await dbAll("SELECT id FROM email_verification_codes WHERE email = ?", email)) as any[];
  return rows.length;
}

/**
 * Send a general email via Resend. Used for task assignment notifications.
 * No-op (logs) when RESEND_API_KEY is not configured.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] (no RESEND_API_KEY) to ${to}: ${subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = `Email send failed (${res.status}): ${body.slice(0, 200)}`;
    recordEmailResult(err);
    throw new Error(err);
  }
  recordEmailResult(null);
}

// Task fields, names and team names are user-controlled — escape them so a
// teammate can't inject HTML/links into an email sent from our domain.
export function escapeHtml(v: string): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function taskAssignedEmailHtml(rawTitle: string, rawDescription: string, rawDueDate: string, rawTeamName: string, rawAssignerName: string): string {
  const taskTitle = escapeHtml(rawTitle);
  const taskDescription = escapeHtml(rawDescription);
  const dueDate = escapeHtml(rawDueDate);
  const teamName = escapeHtml(rawTeamName);
  const assignerName = escapeHtml(rawAssignerName);
  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr><td style="border:1px solid ${LINE};border-left:4px solid ${BRAND};border-radius:12px;padding:16px 18px;background:#fafafa;">
<div style="font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">${taskTitle}</div>
${taskDescription ? `<div style="margin-top:6px;font-family:${FONT};font-size:14px;line-height:1.55;color:${MUTED};">${taskDescription}</div>` : ''}
${dueDate ? `<div style="margin-top:10px;font-family:${FONT};font-size:13px;font-weight:600;color:${INK};">Due: ${dueDate}</div>` : ''}
</td></tr></table>`;
  return emailTemplate({
    preheader: `${rawAssignerName} assigned you: ${rawTitle}`,
    title: "You have a new task",
    intro: `${assignerName} assigned you a task in ${teamName}.`,
    body: card,
    cta: { label: "Open your tasks", href: appUrl("/tasks") },
    footnote: "You're getting this because a teammate assigned you a task in Control Point.",
  });
}

/**
 * Notify assignees by email when a task is assigned. Best-effort — failures
 * are logged, never block task creation.
 */
export async function notifyTaskAssignees(taskId: number, taskTitle: string, taskDescription: string, dueDate: string, teamId: number, assignerMemberId: number, assigneeIds: number[]): Promise<void> {
  try {
    if (!assigneeIds.length) return;
    const team = (await dbGet("SELECT name FROM teams WHERE id = ?", teamId)) as any;
    const assigner = (await dbGet("SELECT name FROM members WHERE id = ?", assignerMemberId)) as any;
    const teamName = team?.name || "your team";
    const assignerName = assigner?.name || "Someone";
    for (const mid of assigneeIds) {
      if (mid === assignerMemberId) continue; // don't email self
      const m = (await dbGet("SELECT email, name FROM members WHERE id = ?", mid)) as any;
      if (!m?.email) continue;
      await sendEmail(
        m.email,
        `New task assigned: ${taskTitle}`,
        taskAssignedEmailHtml(taskTitle, taskDescription || "", dueDate || "", teamName, assignerName)
      ).catch((e) => console.error(`[email] task notify failed for ${m.email}:`, e.message));
    }
  } catch (e: any) {
    console.error("[email] notifyTaskAssignees failed:", e.message);
  }
}
