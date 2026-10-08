// Web sources for Bruno answers (V3.5 phase 4d). When a reply used live web
// search (Gemini google_search grounding or Claude's web_search tool), the
// pages it drew on are listed under the answer so the user can check a price
// or stock status at the store itself. Pure helpers; ai.ts / ai-hybrid.ts
// collect, server.ts appends.

export interface WebSource {
  url: string;
  title: string;
}

export const MAX_SOURCES = 5;

const httpUrl = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : null;
  } catch {
    return null;
  }
};

/** Sources from one Gemini response or stream chunk (groundingMetadata.groundingChunks). */
export function geminiSources(data: any): WebSource[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const out: WebSource[] = [];
  for (const c of chunks) {
    const url = httpUrl(c?.web?.uri);
    if (url) out.push({ url, title: String(c?.web?.title || "").trim() });
  }
  return out;
}

/** Sources from one Claude content block or stream event: citations first, then search results. */
export function anthropicSources(ev: any): { cited: WebSource[]; results: WebSource[] } {
  const cited: WebSource[] = [];
  const results: WebSource[] = [];
  const cite = (c: any) => {
    const url = httpUrl(c?.url);
    if (url) cited.push({ url, title: String(c?.title || "").trim() });
  };
  // Streamed citation, or a whole text block's citations.
  if (ev?.type === "content_block_delta" && ev?.delta?.type === "citations_delta") cite(ev.delta.citation);
  const block = ev?.type === "content_block_start" ? ev.content_block : ev;
  if (block?.type === "text" && Array.isArray(block.citations)) block.citations.forEach(cite);
  if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
    for (const r of block.content) {
      const url = httpUrl(r?.url);
      if (r?.type === "web_search_result" && url) results.push({ url, title: String(r?.title || "").trim() });
    }
  }
  return { cited, results };
}

/** Unique by URL, in order, capped. */
export function dedupeSources(list: WebSource[], max = MAX_SOURCES): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const s of list) {
    if (!s?.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const label = (s: WebSource) => {
  const t = s.title.replace(/[[\]()]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (t) return t;
  try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return "source"; }
};

/** "Sources: [gobilda.com](…) · [REV](…)" under the answer; "" with none. */
export function sourcesFooter(list: WebSource[]): string {
  const s = dedupeSources(list);
  if (!s.length) return "";
  return `\n\n_Sources: ${s.map((x) => `[${label(x)}](${x.url.replace(/\)/g, "%29")})`).join(" · ")}_`;
}
