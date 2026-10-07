/**
 * Content-Security-Policy for the app's HTML document.
 *
 * Rolled out report-only first: browsers report what the policy would block
 * (POST /api/csp-report → the owner's Errors tab) without blocking anything,
 * so a missed origin can't break production. Once reports are clean the
 * same policy is sent as the enforcing header (CSP_ENFORCE=1).
 *
 * Scripts: our own bundle plus the one inline pre-paint theme script, pinned
 * by hash. Styles allow inline (React style props and the motion library set
 * them). Images may come from any https origin (Google/Discord/GitHub
 * avatars, link-preview images, YouTube thumbnails).
 */
import crypto from "crypto";

/** sha256 sources for every inline <script> (no src) in the HTML. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    // Browsers hash the script text after HTML newline normalisation
    // (CRLF and CR become LF), so a file built on Windows must match too.
    const text = m[2].replace(/\r\n?/g, "\n");
    out.push(`'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
  return out;
}

export function buildCsp({ scriptHashes, reportUri }: { scriptHashes: string[]; reportUri?: string }): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", ...scriptHashes]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["media-src", ["'self'", "blob:", "data:"]],
    // Same-origin API + WebSocket (older Safari doesn't treat 'self' as ws/wss).
    ["connect-src", ["'self'", "wss:", "ws:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  if (reportUri) directives.push(["report-uri", [reportUri]]);
  return directives.map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/** A browser CSP violation report (legacy `csp-report` or Reporting API body). */
export function summarizeCspReport(body: any): { message: string; route: string } | null {
  const r = body?.["csp-report"] || (Array.isArray(body) ? body[0]?.body : body?.body) || null;
  if (!r || typeof r !== "object") return null;
  const directive = String(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || r.violatedDirective || "").slice(0, 60);
  const blocked = String(r["blocked-uri"] || r.blockedURL || "").slice(0, 200);
  if (!directive) return null;
  // Origin only: never store query strings or paths that might carry data.
  let what = blocked;
  try { if (/^https?:/i.test(blocked)) what = new URL(blocked).origin; } catch { /* keep raw keyword (inline/eval/data) */ }
  let route = "";
  try { route = new URL(String(r["document-uri"] || r.documentURL || "")).pathname; } catch { /* none */ }
  return { message: `CSP ${directive} blocked ${what || "(unknown)"}`, route: route.slice(0, 200) };
}
