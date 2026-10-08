/**
 * GET /predict/how-it-works: the Predict article. Served
 * byte-identical from one fixed file, as HTML, with its own CSP that pins
 * the page's inline script by hash. Other routes still reach the app.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { startTestServer, type TestServer } from "./helpers/testServer";
import { buildArticleCsp, inlineScriptHashes } from "../csp";

const FILE = join(process.cwd(), "server", "predict", "how-it-works.html");
let t: TestServer;

beforeAll(async () => { t = await startTestServer("cp-article-", { CSP_ENFORCE: "1" }); }, 60_000);
afterAll(async () => { await t?.stop(); });

describe("Predict article page", () => {
  it("serves the file byte-identical as text/html", async () => {
    const r = await fetch(`${t.base}/predict/how-it-works`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/^text\/html/);
    expect(r.headers.get("cache-control")).toBe("no-cache");
    const body = Buffer.from(await r.arrayBuffer());
    expect(body.equals(readFileSync(FILE))).toBe(true);
  });

  it("sends an enforcing CSP that allows exactly the page's inline script", async () => {
    const r = await fetch(`${t.base}/predict/how-it-works`, { method: "HEAD" });
    expect(r.status).toBe(200);
    const csp = r.headers.get("content-security-policy") || "";
    const hashes = inlineScriptHashes(readFileSync(FILE, "utf8"));
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) expect(csp).toContain(h);
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("is a single fixed route: lookalike paths don't serve the file", async () => {
    // (Requests outside this route fall through to the app; production's
    // static handler has its own traversal guard, tested separately.)
    for (const p of ["/predict/how-it-works.html", "/predict/how-it-works/extra", "/predict/how-it-works%2F..%2Fserver.ts", "/predict",
      "/predict/how-it-works/", "/Predict/How-It-Works", "/PREDICT/HOW-IT-WORKS"]) {
      const r = await fetch(`${t.base}${p}`);
      expect(await r.text()).not.toContain("How Control Point Predict Works");
    }
  }, 60_000); // the dev server compiles the app on its first page request
});

describe("buildArticleCsp", () => {
  it("lists the hashes, blocks everything else by default, and allows Google Fonts", () => {
    const csp = buildArticleCsp({ scriptHashes: ["'sha256-abc'"], reportUri: "/api/csp-report" });
    expect(csp).toContain("script-src 'sha256-abc'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src https://fonts.gstatic.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("allows no scripts when the page has none", () => {
    expect(buildArticleCsp({ scriptHashes: [] })).toContain("script-src 'none'");
  });
});
