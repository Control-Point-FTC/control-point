// Bruno links the exact product page (not the store homepage or a Google
// redirect) under a parts answer, and only ever fetches the redirect host and
// the parts stores.
import { describe, expect, it, vi } from "vitest";
import { isProductHtml, looksLikeProductPage, pageTitle, resolveSource, resolveSources, webAppendix } from "../productLinks";

const MOTOR = "https://www.gobilda.com/5203-series-yellow-jacket-motor-1-1-ratio-24mm-length-8mm-rex-shaft-6000-rpm-3-3-5v-encoder/";
const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
// A store's product page carries og:type "product"; its homepage and categories don't.
const page = (title: string, product = true) => `<html><head><title>${title}</title>${product ? '<meta property="og:type" content="product" />' : ""}</head><body>…</body></html>`;

/** A safeGet stand-in: follows REDIRECT to the motor page, refusing hops allowUrl refuses. */
const fakeGet = (pages: Record<string, { status?: number; html?: string; to?: string }>) => vi.fn(async (raw: string, o: any = {}) => {
  let url = new URL(raw);
  o.allowUrl?.(url);
  for (let hop = 0; hop < 4; hop++) {
    const p = pages[url.toString()];
    if (!p) return { url, response: { status: 404, data: "" } };
    if (p.to) { url = new URL(p.to); o.allowUrl?.(url); continue; }
    return { url, response: { status: p.status ?? 200, data: p.html ?? "" } };
  }
  throw new Error("Too many redirects");
});

describe("product pages under a parts answer", () => {
  it("follows Gemini's redirect to the real product page and reads its title", async () => {
    const get = fakeGet({ [REDIRECT]: { to: MOTOR }, [MOTOR]: { html: page("5203 Series Yellow Jacket Motor (1:1 Ratio, 24mm Length 8mm REX&reg; Shaft, 6000 RPM, 3.3 - 5V Encoder) | goBILDA") } });
    const r = await resolveSource({ url: REDIRECT, title: "gobilda.com" }, get as any);
    expect(r).toEqual({ url: MOTOR, title: "5203 Series Yellow Jacket Motor (1:1 Ratio, 24mm Length 8mm REX® Shaft, 6000 RPM, 3.3 - 5V Encoder)", store: "goBILDA", product: true });
  });

  it("lists the product first with a direct link, the other pages as sources", async () => {
    const get = fakeGet({
      [REDIRECT]: { to: MOTOR },
      [MOTOR]: { html: page("Yellow Jacket Motor 6000 RPM | goBILDA") },
      "https://www.gobilda.com/": { html: page("goBILDA", false) },
    });
    const text = await webAppendix([
      { url: REDIRECT, title: "gobilda.com" },
      { url: "https://www.gobilda.com/", title: "gobilda.com" },
      { url: "https://www.chiefdelphi.com/t/motors/1", title: "Chief Delphi" },
    ], get as any);
    expect(text).toContain(`**Product page**\n- 🔗 [Yellow Jacket Motor 6000 RPM](${MOTOR}) — goBILDA`);
    expect(text).toContain("_Sources: [goBILDA](https://www.gobilda.com/) · [Chief Delphi](https://www.chiefdelphi.com/t/motors/1)_");
    expect(text.match(/yellow-jacket/g)).toHaveLength(1);
  });

  it("never fetches other sites, and a redirect leaving the stores keeps the original link", async () => {
    const get = fakeGet({ [REDIRECT]: { to: "http://169.254.169.254/latest/meta-data" } });
    expect(await resolveSource({ url: "https://www.chiefdelphi.com/t/x", title: "CD" }, get as any)).toEqual({ url: "https://www.chiefdelphi.com/t/x", title: "CD" });
    expect(get).not.toHaveBeenCalled();
    expect(await resolveSource({ url: REDIRECT, title: "r" }, get as any)).toEqual({ url: REDIRECT, title: "r" });
  });

  it("a page without product markup stays a source, even at a product-like URL", async () => {
    const cat = "https://www.revrobotics.com/cat/motors/";
    const list = "https://www.servocity.com/motors/";
    const get = fakeGet({ [cat]: { html: page("Motors - REV Robotics") }, [list]: { html: page("Motors | ServoCity", false) } });
    expect((await resolveSource({ url: cat, title: "" }, get as any)).product).toBe(false);
    expect((await resolveSource({ url: list, title: "" }, get as any)).product).toBe(false);
  });

  it("a slow source keeps its link without hiding the ones that finished", async () => {
    const slowUrl = "https://www.andymark.com/products/slow";
    const get = vi.fn(async (raw: string, o: any) => raw === slowUrl
      ? new Promise((_, reject) => o.signal?.addEventListener("abort", () => reject(new Error("aborted"))))
      : fakeGet({ [MOTOR]: { html: page("Yellow Jacket Motor | goBILDA") } })(raw, o));
    const r = await resolveSources([{ url: MOTOR, title: "gobilda.com" }, { url: slowUrl, title: "andymark.com" }], get as any, 50);
    expect(r).toEqual([
      { url: MOTOR, title: "Yellow Jacket Motor", store: "goBILDA", product: true },
      { url: slowUrl, title: "andymark.com" },
    ]);
  });

  it("stopping the reply cancels the page checks", async () => {
    const stop = new AbortController();
    const seen: AbortSignal[] = [];
    const get = vi.fn((_raw: string, o: any) => { seen.push(o.signal); return new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new Error("aborted")))); });
    const pending = resolveSources([{ url: MOTOR, title: "gobilda.com" }], get as any, 10_000, stop.signal);
    stop.abort();
    expect(await pending).toEqual([{ url: MOTOR, title: "gobilda.com" }]);
    expect(seen[0].aborted).toBe(true);
    expect(await resolveSources([{ url: MOTOR, title: "x" }], get as any, 10_000, stop.signal)).toEqual([{ url: MOTOR, title: "x" }]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("a blocked or slow store leaves the sources as they were", async () => {
    const blocked = fakeGet({ [MOTOR]: { status: 403, html: "no" } });
    expect(await resolveSource({ url: MOTOR, title: "gobilda.com" }, blocked as any)).toEqual({ url: MOTOR, title: "gobilda.com" });
    const slow = vi.fn(() => new Promise(() => {}));
    expect(await resolveSources([{ url: MOTOR, title: "gobilda.com" }], slow as any, 20)).toEqual([{ url: MOTOR, title: "gobilda.com" }]);
    expect(await webAppendix([], slow as any)).toBe("");
  });

  it("tells product pages from homepages, searches and categories", () => {
    expect(looksLikeProductPage(MOTOR)).toBe(true);
    expect(looksLikeProductPage("https://www.revrobotics.com/rev-41-1600/")).toBe(true);
    for (const u of ["https://www.gobilda.com/", "https://www.gobilda.com/search.php?search_query=motor", "https://www.andymark.com/search?q=motor", "https://www.amazon.com/s?k=servo", "https://www.gobilda.com/categories/motors", "https://www.revrobotics.com/cat/motors/", "https://www.mcmaster.com/products/screws/"]) {
      expect(looksLikeProductPage(u)).toBe(false);
    }
  });

  it("reads og:title, decodes entities and drops the store suffix", () => {
    expect(pageTitle('<meta property="og:title" content="HD Hex Motor &amp; Kit" /><title>x</title>', "REV Robotics")).toBe("HD Hex Motor & Kit");
    expect(pageTitle("<title>UltraPlanetary Gearbox - REV Robotics</title>", "REV Robotics")).toBe("UltraPlanetary Gearbox");
    expect(pageTitle("<title>Wire, 3 - 5V</title>", "goBILDA")).toBe("Wire, 3 - 5V");
    // A value ends at its own opening quote.
    expect(pageTitle(`<meta property="og:title" content="Builder's Motor" />`, "goBILDA")).toBe("Builder's Motor");
    expect(pageTitle(`<meta property='og:title' content='4" Grip Wheel' />`, "goBILDA")).toBe('4" Grip Wheel');
  });

  it("recognises product markup", () => {
    expect(isProductHtml('<meta property="og:type" content="product" />')).toBe(true);
    expect(isProductHtml('<meta content="product" property="og:type">')).toBe(true);
    expect(isProductHtml('<script type="application/ld+json">{"@type": "Product"}</script>')).toBe(true);
    expect(isProductHtml('<div itemtype="http://schema.org/Product">')).toBe(true);
    expect(isProductHtml('<meta property="og:type" content="website" />')).toBe(false);
  });
});
