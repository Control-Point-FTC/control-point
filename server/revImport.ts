// REV Robotics product import (V3.5 phase 5). A pasted link (or a bare SKU
// like REV-41-1600) becomes the canonical product URL; the page is read with
// structured data first (JSON-LD / microdata / Open Graph, which survive a
// theme change) and the BigCommerce theme selectors second. When REV's page
// can't be read at all, the SKU still comes from the link itself. Pure: the
// route in server.ts does the fetching.

import * as cheerio from "cheerio";

const REV_SKU = /\b(REV-\d{2}-\d{4}(?:-[A-Z0-9]+)?)\b/i;

export interface RevTarget {
  /** Canonical https URL on revrobotics.com, no query or fragment. */
  url: string;
  /** SKU read from the link ("/rev-41-1600/" → "REV-41-1600"), if any. */
  sku: string | null;
}

/** A REV link or SKU → where to fetch it; null when it isn't REV. */
export function revTarget(input: unknown): RevTarget | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const bare = raw.match(/^REV-\d{2}-\d{4}(?:-[A-Z0-9]+)?$/i);
  if (bare) {
    const sku = bare[0].toUpperCase();
    return { url: `https://www.revrobotics.com/${sku.toLowerCase()}/`, sku };
  }
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host !== "revrobotics.com" && !host.endsWith(".revrobotics.com")) return null;
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // Tracking parameters and fragments change nothing on the page; http and
  // the bare domain redirect anyway.
  const path = u.pathname.replace(/\/{2,}/g, "/");
  const url = `https://${host === "revrobotics.com" ? "www.revrobotics.com" : host}${path.endsWith("/") || /\.\w+$/.test(path) ? path : `${path}/`}`;
  const slug = path.match(REV_SKU);
  return { url, sku: slug ? slug[1].toUpperCase() : null };
}

export interface RevProduct { name?: string; sku?: string; part_number?: string; cost?: number; category?: string }

const num = (v: unknown): number | undefined => {
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

/** Product fields from a REV product page. */
export function parseRevProduct(html: string): RevProduct {
  const $ = cheerio.load(html || "");
  const out: RevProduct = {};
  // 1. JSON-LD Product.
  $('script[type="application/ld+json"]').each((_, el) => {
    let data: any;
    try { data = JSON.parse($(el).contents().text()); } catch { return; }
    const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
    for (const it of items) {
      if (!it || !String(it["@type"] || "").includes("Product")) continue;
      out.name ||= String(it.name || "").trim() || undefined;
      out.sku ||= String(it.sku || it.mpn || "").trim() || undefined;
      const offer = Array.isArray(it.offers) ? it.offers[0] : it.offers;
      out.cost ??= num(offer?.price ?? offer?.lowPrice);
    }
  });
  // 2. Microdata inside the Product itself (a breadcrumb, the store or a
  // related item also carry itemprop="name"), then the product title.
  const product = $('[itemscope][itemtype*="schema.org/Product"]').first();
  const prop = (name: string) => {
    const el = product.find(`[itemprop="${name}"]`).filter((_, e) => $(e).closest("[itemscope]").is(product)).first();
    return (el.attr("content") || el.text() || "").trim();
  };
  if (product.length) {
    out.name ||= prop("name") || undefined;
    out.sku ||= prop("sku") || undefined;
    out.cost ??= num(prop("price"));
  }
  // 3. The BigCommerce theme REV used when this importer was written, then Open Graph.
  out.name ||= $("h1.productView-title").text().trim() || undefined;
  out.name ||= $('meta[property="og:title"]').attr("content")?.trim() || undefined;
  out.cost ??= num($('meta[property="product:price:amount"]').attr("content"));
  out.sku ||= $("dd.productView-info-value--sku").text().trim() || undefined;
  const upc = $("dd.productView-info-value--upc").text().trim();
  if (upc) out.part_number = upc;
  out.cost ??= num($("span.price.price--withoutTax.price--main").first().text());
  const cat = $("a[href*='/cat/']").first().text().trim();
  if (cat) out.category = cat;
  if (out.name) out.name = out.name.replace(/\s*[|–-]\s*REV Robotics\s*$/i, "").trim();
  if (out.cost !== undefined && !(out.cost >= 0)) delete out.cost;
  return out;
}
