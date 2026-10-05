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

/**
 * Shared email template — dark card, yellow Control Point badge, volt theme.
 * All app emails use this so they look consistent.
 */
function emailTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:40px 24px;">
<div style="text-align:center;margin-bottom:24px;">
<div style="display:inline-block;background:#ffc700;color:#09090b;font-weight:800;font-size:20px;padding:10px 18px;border-radius:12px;">Control Point</div>
</div>
<div style="background:#141419;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center;">
<h1 style="color:#fff;font-size:20px;margin:0 0 8px;">${title}</h1>
${bodyHtml}
</div>
</div></body></html>`;
}

function verificationEmailHtml(code: string): string {
  return emailTemplate(
    'Verify your email',
    `<p style="color:#a1a1aa;font-size:14px;margin:0 0 20px;">Enter this code in Control Point to finish creating your account. It expires in ${VERIFY_CODE_TTL_MINUTES} minutes.</p>
<div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#ffc700;margin:8px 0 20px;">${code}</div>
<p style="color:#71717a;font-size:12px;margin:0;">If you didn't ask for this, you can ignore this email.</p>`
  );
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Dev/test fallback: no email provider configured.
    console.log(`[email-verify] (no RESEND_API_KEY) verification code for ${to}: ${code}`);
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
      subject: `Your Control Point verification code: ${code}`,
      html: verificationEmailHtml(code),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Email send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

/** Is this address already verified (account-wide, by email)? */
export async function isEmailVerified(email: string): Promise<boolean> {
  const row = (await dbGet("SELECT email FROM verified_emails WHERE email = ?", email)) as any;
  return Boolean(row);
}

export async function markEmailVerified(email: string): Promise<void> {
  await dbRun(
    "INSERT INTO verified_emails (email, verified_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING",
    email,
    new Date().toISOString()
  );
  // Consume any outstanding codes for this address.
  await dbRun("DELETE FROM email_verification_codes WHERE email = ?", email);
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
export async function issueVerificationCode(email: string): Promise<{ sent: true } | { sent: false; cooldownSeconds: number }> {
  const recent = (await dbGet(
    "SELECT created_at FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
    email
  )) as any;
  if (recent?.created_at) {
    const ageSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    const wait = VERIFY_RESEND_COOLDOWN_SECONDS - ageSec;
    if (wait > 0) return { sent: false, cooldownSeconds: Math.ceil(wait) };
  }
  // Invalidate older outstanding codes; only the newest is valid.
  await dbRun("DELETE FROM email_verification_codes WHERE email = ?", email);
  const code = generateCode();
  const nowIso = new Date().toISOString();
  await dbRun(
    "INSERT INTO email_verification_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)",
    email,
    hashCode(code),
    codeExpiry(),
    nowIso
  );
  await sendVerificationEmail(email, code);
  return { sent: true };
}

export type CodeCheck = { ok: true } | { ok: false; reason: "expired" | "invalid" | "locked" };

/** Validate a submitted code. Wrong guesses are counted; too many locks the code. */
export async function checkVerificationCode(email: string, code: string): Promise<CodeCheck> {
  const row = (await dbGet(
    "SELECT id, code_hash, expires_at, attempts FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
    email
  )) as any;
  if (!row) return { ok: false, reason: "invalid" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= VERIFY_MAX_ATTEMPTS) {
    await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
    return { ok: false, reason: "locked" };
  }
  const guess = hashCode(String(code || "").trim());
  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(guess, "hex");
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!match) {
    const attempts = row.attempts + 1;
    if (attempts >= VERIFY_MAX_ATTEMPTS) {
      await dbRun("DELETE FROM email_verification_codes WHERE id = ?", row.id);
      return { ok: false, reason: "locked" };
    }
    await dbRun("UPDATE email_verification_codes SET attempts = ? WHERE id = ?", attempts, row.id);
    return { ok: false, reason: "invalid" };
  }
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
    throw new Error(`Email send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

// Task fields, names and team names are user-controlled — escape them so a
// teammate can't inject HTML/links into an email sent from our domain.
function escapeHtml(v: string): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function taskAssignedEmailHtml(rawTitle: string, rawDescription: string, rawDueDate: string, rawTeamName: string, rawAssignerName: string): string {
  const taskTitle = escapeHtml(rawTitle);
  const taskDescription = escapeHtml(rawDescription);
  const dueDate = escapeHtml(rawDueDate);
  const teamName = escapeHtml(rawTeamName);
  const assignerName = escapeHtml(rawAssignerName);
  return emailTemplate(
    'New task assigned',
    `<p style="color:#a1a1aa;font-size:14px;margin:0 0 20px;">${assignerName} assigned you a task in ${teamName}:</p>
<div style="background:#09090b;border:1px solid rgba(255,199,0,0.2);border-radius:12px;padding:20px;margin-bottom:20px;text-align:left;">
<div style="color:#fafafa;font-size:16px;font-weight:700;margin-bottom:8px;">${taskTitle}</div>
${taskDescription ? `<div style="color:#a1a1aa;font-size:14px;margin-bottom:12px;">${taskDescription}</div>` : ''}
${dueDate ? `<div style="color:#ffc700;font-size:13px;font-weight:600;">Due: ${dueDate}</div>` : ''}
</div>
<p style="color:#71717a;font-size:12px;margin:0;">Open Control Point to view and update this task.</p>`
  );
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
