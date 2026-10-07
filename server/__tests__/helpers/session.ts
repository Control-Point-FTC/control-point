// Test helpers for cookie sessions: the server stores sha256 of the token
// (prefixed "h:") and reads the token from the HttpOnly cp_session cookie.
import { createHash } from "node:crypto";

/** A test token in the current format (seed it with sessionDbId). */
export const testToken = (name: string) => `cps_test-${name}`;

/** The sessions.id the server looks up for a token. */
export function sessionDbId(token: string): string {
  return "h:" + createHash("sha256").update(token).digest("hex");
}

/** Put a session on request headers the way a browser would. */
export function withSession(headers: Headers, token: string | undefined) {
  if (token) headers.set("cookie", `cp_session=${encodeURIComponent(token)}`);
  // State-changing requests must carry the client header (CSRF guard).
  headers.set("x-cp-client", "1");
  return headers;
}
