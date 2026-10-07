// Outbound fetches of user-supplied URLs (REV product import, chat link
// previews) must never reach the server's own network: localhost, the LAN,
// or the cloud metadata service at 169.254.169.254. Hostname blocklists miss
// DNS names that resolve to private IPs, decimal/IPv6-mapped spellings and
// redirects, so the check runs on the *resolved* address at connect time
// (via the socket's `lookup` hook) and every redirect hop is re-validated.
import dns from "dns";
import net from "net";
import axios from "axios";

/** True for any address that isn't a routable public unicast address. */
export function isPrivateAddress(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  // IPv4-mapped / -compatible IPv6 (::ffff:10.0.0.1) → judge the IPv4 part.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) addr = mapped[1];
  // The WHATWG URL parser rewrites them in hex (::ffff:7f00:1) — decode too.
  const mappedHex = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    addr = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const kind = net.isIP(addr);
  if (kind === 4) {
    const [a, b] = addr.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved + broadcast
    return false;
  }
  if (kind === 6) {
    if (addr === "::" || addr === "::1") return true;
    if (/^f[cd]/.test(addr)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
    if (/^ff/.test(addr)) return true; // multicast
    if (addr.startsWith("64:ff9b:")) return true; // NAT64 → could map to private v4
    if (addr.startsWith("2001:db8")) return true; // documentation
    return false;
  }
  return true; // not an IP at all — refuse
}

export class UnsafeUrlError extends Error {}

/** dns.lookup replacement that refuses private results (pins the checked IP). */
export function guardedLookup(hostname: string, options: any, callback: any) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : (options || {});
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses: any) => {
    if (err) return cb(err);
    const list: { address: string; family: number }[] = Array.isArray(addresses) ? addresses : [addresses];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) return cb(new UnsafeUrlError(`Refusing to connect to ${hostname}`));
    if (opts.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

/** Parse and pre-check a URL (protocol, literal-IP hosts). */
export function checkPublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("Invalid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("Only http(s) URLs are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("URLs with credentials are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError("Private addresses are not allowed");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Private addresses are not allowed");
  }
  return u;
}

export interface SafeGetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Extra per-hop check (e.g. an exact host allowlist). Throw to refuse. */
  allowUrl?: (u: URL) => void;
  responseType?: "text" | "arraybuffer";
}

/** GET a user-supplied URL with SSRF protection on every hop. */
export async function safeGet(raw: string, o: SafeGetOptions = {}): Promise<{ url: URL; response: any }> {
  let current = checkPublicUrl(raw);
  o.allowUrl?.(current);
  const maxRedirects = o.maxRedirects ?? 3;
  for (let hop = 0; ; hop++) {
    const response = await axios.get(current.toString(), {
      headers: o.headers,
      timeout: o.timeoutMs ?? 8000,
      maxContentLength: o.maxBytes ?? 2 * 1024 * 1024,
      maxRedirects: 0,
      responseType: o.responseType ?? "text",
      validateStatus: () => true,
      lookup: guardedLookup as any,
      proxy: false,
    } as any);
    const loc = response.headers?.location;
    if (response.status >= 300 && response.status < 400 && loc) {
      if (hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects");
      current = checkPublicUrl(new URL(String(loc), current).toString());
      o.allowUrl?.(current);
      continue;
    }
    return { url: current, response };
  }
}
