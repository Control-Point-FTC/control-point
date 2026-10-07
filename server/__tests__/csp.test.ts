import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "crypto";
import { buildCsp, inlineScriptHashes, summarizeCspReport } from "../csp";
import { startTestServer, type TestServer } from "./helpers/testServer";

vi.setConfig({ testTimeout: 30_000 });

describe("CSP policy", () => {
  it("hashes only inline scripts", () => {
    const body = "\n      try { x() } catch (e) {}\n    ";
    const html = `<head><script type="module" src="/a.js"></script></head><body><script>${body}</script></body>`;
    const expected = `'sha256-${crypto.createHash("sha256").update(body).digest("base64")}'`;
    expect(inlineScriptHashes(html)).toEqual([expected]);
  });

  it("hashes the newline-normalised text, as browsers do", () => {
    const lf = inlineScriptHashes("<script>\n  a();\n</script>");
    expect(inlineScriptHashes("<script>\r\n  a();\r\n</script>")).toEqual(lf);
    expect(inlineScriptHashes("<script>\r  a();\r</script>")).toEqual(lf);
  });

  it("locks down scripts, objects, framing and base; reports violations", () => {
    const p = buildCsp({ scriptHashes: ["'sha256-abc'"], reportUri: "/api/csp-report" });
    expect(p).toContain("script-src 'self' 'sha256-abc'");
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(p).not.toMatch(/unsafe-eval/);
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("base-uri 'self'");
    expect(p).toContain("report-uri /api/csp-report");
  });

  it("summarises a report to directive + origin, never the full URL", () => {
    const s = summarizeCspReport({ "csp-report": {
      "document-uri": "https://tryctrlpoint.org/tasks?id=5&token=secret",
      "effective-directive": "img-src",
      "blocked-uri": "http://tracker.example/p.gif?u=me@x.com",
    } });
    expect(s).toEqual({ message: "CSP img-src blocked http://tracker.example", route: "/tasks" });
    expect(summarizeCspReport({ nope: 1 })).toBeNull();
    // Reporting API shape.
    expect(summarizeCspReport([{ body: { effectiveDirective: "script-src", blockedURL: "inline", documentURL: "https://a.test/x" } }]))
      .toEqual({ message: "CSP script-src blocked inline", route: "/x" });
  });
});

describe("CSP report endpoint", () => {
  let t: TestServer;
  beforeAll(async () => { t = await startTestServer("cp-csp-"); }, 120_000);
  afterAll(async () => { await t?.stop(); });

  it("accepts a browser report without the client header and stores it for the owner", async () => {
    const res = await fetch(`${t.base}/api/csp-report`, {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({ "csp-report": { "document-uri": "https://x.test/calendar", "effective-directive": "font-src", "blocked-uri": "https://fonts.example/a.woff2" } }),
    });
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 300));
    const row = (await t.db.execute("SELECT kind, message, route FROM client_errors ORDER BY id DESC LIMIT 1")).rows[0] as any;
    expect(row).toMatchObject({ kind: "csp", message: "CSP font-src blocked https://fonts.example", route: "/calendar" });
  });
});
