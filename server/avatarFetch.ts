// Profile-picture downloads (OAuth avatars, saved avatar URLs) go through
// safeGet so a URL can never reach the server's own network (V5 audit M1).
import { safeGet } from "./safeFetch.js";

/** Download a profile picture URL (OAuth or one a member saved) without letting
 *  it reach the server's own network: safeGet blocks private addresses on
 *  every hop. An image under 2 MB, or the HTTP status. */
export async function fetchAvatarImage(url: string, get: typeof safeGet = safeGet): Promise<{ status: number; buf: Buffer | null; ctype: string }> {
  const { response } = await get(url, { timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, maxRedirects: 3, responseType: "arraybuffer" });
  const ctype = String(response.headers?.["content-type"] || "");
  const buf = response.data ? Buffer.from(response.data) : null;
  const ok = response.status >= 200 && response.status < 300 && !!buf && buf.length > 0 && buf.length < 2 * 1024 * 1024 && ctype.startsWith("image/");
  return { status: response.status, buf: ok ? buf : null, ctype };
}
