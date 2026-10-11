// Exact product links under Bruno's web answers. Gemini's grounding hands us
// redirect URLs (vertexaisearch.cloud.google.com/grounding-api-redirect/…),
// so a "where do I buy the 6000 RPM goBILDA motor" answer could only point at
// a redirect or a store homepage. Here each source on a known parts store is
// followed to its real page, the page's own title is read, and the product
// pages are listed under the answer ("goBILDA 5203 Series Yellow Jacket
// Motor (… 6000 RPM …)"), linking straight to that product. Only the Google
// redirect host and the stores in SUPPLIERS are ever fetched (SSRF-safe
// safeGet on every hop); anything else keeps its original link.
import { SUPPLIERS } from "../src/utils/suppliers.js";
import { safeGet } from "./safeFetch.js";
import { dedupeSources, sourcesFooter, type WebSource } from "./webSources.js";

export const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
/** Product pages listed under one answer. */
export const MAX_PRODUCTS = 3;
/** The whole resolve step never holds the reply's footer longer than this. */
export const RESOLVE_BUDGET_MS = 5000;

export interface ResolvedSource extends WebSource {
  /** The store's name when the page is on a known parts store. */
  store?: string;
  /** A product page on that store (not its homepage, a category or a search). */
  product?: boolean;
}

const storeFor = (host: string) => {
  const h = host.toLowerCase();
  return SUPPLIERS.find((s) => s.domains.some((d) => h === d || h.endsWith(`.${d}`))) || null;
};
const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };

/** A store page that is one product, judged from the URL alone. */
export function looksLikeProductPage(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const path = u.pathname.replace(/\/+$/, "");
  if (!path || path === "/") return false;
  if (/(^|\/)(search(\.php)?|s|cart|account|login|blog|categories?|collections?|brands?|pages?)(\/|$)/i.test(path)) return false;
  if (["search_query", "q", "k", "query"].some((k) => u.searchParams.has(k))) return false;
  return true;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "®", trade: "™", copy: "©", deg: "°", times: "×", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** The page's product name: og:title, else <title>, without the store suffix. */
export function pageTitle(html: string, store: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]*>/i.exec(html)?.[0];
  const ogContent = og ? /content=["']([^"']*)["']/i.exec(og)?.[1] : "";
  const raw = ogContent || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
  let t = decode(raw).replace(/\s+/g, " ").trim();
  // "Yellow Jacket Motor | goBILDA" / "… - REV Robotics" → the product alone.
  const words = store.toLowerCase().split(/\s+/)[0];
  t = t.replace(new RegExp(`\\s*[|–—-]\\s*[^|–—-]*${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^|–—-]*$`, "i"), "").trim();
  return t.slice(0, 140);
}

type Getter = typeof safeGet;

/** One source: followed to its real store page with that page's title, or as it was. */
export async function resolveSource(s: WebSource, get: Getter = safeGet): Promise<ResolvedSource> {
  const host = hostOf(s.url);
  const fetchable = host === GROUNDING_REDIRECT_HOST || !!storeFor(host);
  if (!fetchable) return s;
  try {
    const { url, response } = await get(s.url, {
      timeoutMs: 4000,
      maxBytes: 1024 * 1024,
      maxRedirects: 3,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ControlPointBruno/1.0; +https://tryctrlpoint.org)", Accept: "text/html" },
      // Only the redirect service and the parts stores, on every hop.
      allowUrl: (u) => {
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("not http");
        if (u.hostname.toLowerCase() !== GROUNDING_REDIRECT_HOST && !storeFor(u.hostname)) throw new Error("not a store");
      },
    });
    const store = storeFor(url.hostname);
    if (!store || response?.status !== 200) return s;
    const finalUrl = url.toString();
    const title = typeof response.data === "string" ? pageTitle(response.data, store.label) : "";
    return { url: finalUrl, title: title || s.title, store: store.label, product: looksLikeProductPage(finalUrl) && !!title };
  } catch {
    // Off the allowlist (a forum, a video), blocked or slow: the original link still works.
    return s;
  }
}

/** Every source resolved, within the time budget (else the originals). */
export async function resolveSources(list: WebSource[], get: Getter = safeGet, budgetMs = RESOLVE_BUDGET_MS): Promise<ResolvedSource[]> {
  const sources = dedupeSources(list);
  if (!sources.length) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ResolvedSource[]>((r) => { timer = setTimeout(() => r(sources), budgetMs); });
  try {
    const resolved = await Promise.race([Promise.all(sources.map((s) => resolveSource(s, get))), late]);
    return dedupeSources(resolved) as ResolvedSource[];
  } finally {
    clearTimeout(timer);
  }
}

const mdText = (t: string) => t.replace(/[\\`*_[\]()<>#|~]/g, (c) => `\\${c}`);
const mdUrl = (u: string) => u.replace(/[\\()<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

/** "🔗 [5203 Series Yellow Jacket Motor (…)](https://www.gobilda.com/…) — goBILDA" lines; "" with none. */
export function productLinksBlock(list: ResolvedSource[]): string {
  const products = list.filter((s) => s.product && s.store).slice(0, MAX_PRODUCTS);
  if (!products.length) return "";
  return `\n\n**Product ${products.length === 1 ? "page" : "pages"}**\n${products.map((p) => `- 🔗 [${mdText(p.title)}](${mdUrl(p.url)}) — ${p.store}`).join("\n")}`;
}

/** Under a web answer: the exact product pages, then the other pages it used. */
export async function webAppendix(list: WebSource[], get: Getter = safeGet, budgetMs = RESOLVE_BUDGET_MS): Promise<string> {
  const resolved = await resolveSources(list, get, budgetMs);
  const shown = new Set(resolved.filter((s) => s.product && s.store).slice(0, MAX_PRODUCTS).map((s) => s.url));
  return productLinksBlock(resolved) + sourcesFooter(resolved.filter((s) => !shown.has(s.url)));
}
