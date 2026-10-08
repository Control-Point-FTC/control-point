// Inventory suppliers (V3.5 phase 5). Each part's supplier is detected from
// its purchase link, then its SKU format, then its name ("goBILDA 2000
// Series…", "Axon Max+"), and every part gets an order link: the saved link,
// else the supplier's product or search page for its SKU (or name). Pure:
// shared by the inventory page and the server.

export interface Supplier {
  id: string;
  label: string;
  /** Hosts (and their subdomains) that belong to this supplier. */
  domains: string[];
  /** SKU formats only this supplier uses. */
  sku?: RegExp;
  /** Brand words in a part name. */
  name?: RegExp;
  /** Order page for a SKU or search words. */
  link: (q: string, isSku: boolean) => string;
}

const enc = encodeURIComponent;
export const SUPPLIERS: Supplier[] = [
  {
    id: 'rev', label: 'REV Robotics', domains: ['revrobotics.com'],
    sku: /^REV-\d{2}-\d{4}(-[A-Z0-9]+)?$/i, name: /\bREV\b/,
    // REV product pages live at /<sku in lowercase>/.
    link: (q, isSku) => isSku && /^REV-\d{2}-\d{4}/i.test(q) ? `https://www.revrobotics.com/${q.toLowerCase()}/` : `https://www.revrobotics.com/search.php?search_query=${enc(q)}`,
  },
  {
    id: 'gobilda', label: 'goBILDA', domains: ['gobilda.com'],
    // "5203-2402-0019", or the 10-digit codes on goBILDA order PDFs ("5027103001").
    sku: /^(\d{4}-\d{4}-\d{4}|\d{10})$/, name: /\bgo\s?bilda\b/i,
    link: (q) => `https://www.gobilda.com/search.php?search_query=${enc(q)}`,
  },
  {
    id: 'axon', label: 'Axon Robotics', domains: ['axon-robotics.com'],
    name: /\baxon\b/i,
    link: (q) => `https://axon-robotics.com/search?q=${enc(q)}`,
  },
  {
    id: 'andymark', label: 'AndyMark', domains: ['andymark.com'],
    sku: /^am-\d{3,5}[a-z]?$/i, name: /\bandy\s?mark\b/i,
    link: (q) => `https://www.andymark.com/search?q=${enc(q)}`,
  },
  {
    id: 'servocity', label: 'ServoCity', domains: ['servocity.com'],
    name: /\b(servocity|actobotics)\b/i,
    link: (q) => `https://www.servocity.com/search.php?search_query=${enc(q)}`,
  },
  {
    id: 'studica', label: 'Studica', domains: ['studica.com'],
    name: /\bstudica\b/i,
    link: (q) => `https://www.studica.com/search?q=${enc(q)}`,
  },
  {
    id: 'mcmaster', label: 'McMaster-Carr', domains: ['mcmaster.com'],
    sku: /^\d{4,5}[A-Z]\d{1,4}$/, name: /\bmcmaster\b/i,
    link: (q, isSku) => isSku ? `https://www.mcmaster.com/${enc(q)}/` : `https://www.mcmaster.com/products/${enc(q)}/`,
  },
  {
    id: 'amazon', label: 'Amazon', domains: ['amazon.com', 'amzn.to', 'a.co'],
    link: (q) => `https://www.amazon.com/s?k=${enc(q)}`,
  },
];

const byId = new Map(SUPPLIERS.map((s) => [s.id, s]));
export const supplierById = (id: unknown): Supplier | null => (typeof id === 'string' && byId.get(id)) || null;
export const supplierLabel = (id: unknown): string => supplierById(id)?.label || '';

/** Longest purchase link kept; longer ones are refused, never shortened. */
export const MAX_PURCHASE_URL = 2000;

/** An http(s) URL, trimmed, or null. "revrobotics.com/x" gains https://. */
export function cleanPurchaseUrl(v: unknown): string | null {
  let s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.length > MAX_PURCHASE_URL) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    const out = u.toString();
    return out.length > MAX_PURCHASE_URL ? null : out;
  } catch {
    return null;
  }
}

function supplierForHost(url: string | null): Supplier | null {
  if (!url) return null;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  return SUPPLIERS.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) || null;
}

export interface PartLike { url?: string | null; sku?: string | null; part_number?: string | null; name?: string | null; description?: string | null; supplier?: string | null }

/** The part's supplier id, or null when nothing identifies one. */
export function detectSupplier(p: PartLike): string | null {
  const fromUrl = supplierForHost(cleanPurchaseUrl(p.url));
  if (fromUrl) return fromUrl.id;
  for (const code of [p.sku, p.part_number]) {
    const c = String(code || '').trim();
    if (!c) continue;
    const s = SUPPLIERS.find((x) => x.sku?.test(c));
    if (s) return s.id;
  }
  const text = `${p.name || ''} ${p.description || ''}`;
  return SUPPLIERS.find((x) => x.name?.test(text))?.id || null;
}

/** The supplier to show: the saved one when valid, else detected. */
export function partSupplier(p: PartLike): string | null {
  return supplierById(p.supplier)?.id || detectSupplier(p);
}

/** Where to order the part: its saved link, else the supplier's page for its SKU (or name). */
export function purchaseLink(p: PartLike): string | null {
  const saved = cleanPurchaseUrl(p.url);
  if (saved) return saved;
  const s = supplierById(partSupplier(p));
  if (!s) return null;
  // A SKU in the supplier's own format goes straight to its page; a team's
  // own SKU ("BOX-12") means nothing to the store, so search by name instead.
  for (const code of [p.sku, p.part_number]) {
    const c = String(code || '').trim();
    if (c && s.sku?.test(c)) return s.link(c, true);
  }
  const name = String(p.name || '').trim();
  return name ? s.link(name, false) : null;
}
