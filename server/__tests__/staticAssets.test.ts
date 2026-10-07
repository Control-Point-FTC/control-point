// Production static serving: pre-compressed assets, cache policy, SPA
// fallback, and no path traversal.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { serveDist, pickEncoding, cacheControlFor } from "../staticAssets";

let server: http.Server;
let base = "";
let dir = "";
const JS = "console.log('hello from a hashed chunk');".repeat(50);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cp-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(dir, "assets", "index-abc.js"), JS);
  writeFileSync(join(dir, "assets", "index-abc.js.br"), brotliCompressSync(Buffer.from(JS)));
  writeFileSync(join(dir, "assets", "index-abc.js.gz"), gzipSync(Buffer.from(JS)));
  writeFileSync(join(dir, "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(tmpdir(), "cp-secret.txt"), "secret");
  const app = express();
  serveDist(app, dir);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => {
  server?.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Node's fetch decodes br/gzip transparently, so ask for raw bytes via http.
function raw(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http.get(base + path, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", reject);
  });
}

describe("pickEncoding / cacheControlFor", () => {
  it("prefers brotli, falls back to gzip, honours q=0", () => {
    const has = () => true;
    expect(pickEncoding("gzip, deflate, br", "/x.js", has)?.name).toBe("br");
    expect(pickEncoding("gzip", "/x.js", has)?.name).toBe("gzip");
    expect(pickEncoding("br;q=0, gzip", "/x.js", has)?.name).toBe("gzip");
    expect(pickEncoding("identity", "/x.js", has)).toBeNull();
    expect(pickEncoding("br", "/x.js", () => false)).toBeNull();
  });
  it("caches hashed assets for a year and always revalidates the shell", () => {
    expect(cacheControlFor("/assets/index-abc.js")).toContain("immutable");
    expect(cacheControlFor("/")).toBe("no-cache");
    expect(cacheControlFor("/index.html")).toBe("no-cache");
    expect(cacheControlFor("/sw.js")).toBe("no-cache");
    expect(cacheControlFor("/icon.png")).toBe("public, max-age=3600");
  });
});

describe("serveDist", () => {
  it("sends the brotli variant with the right headers", async () => {
    const r = await raw("/assets/index-abc.js", { "accept-encoding": "gzip, br" });
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("br");
    expect(r.headers["content-type"]).toMatch(/javascript/);
    expect(r.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(r.headers["vary"]).toMatch(/Accept-Encoding/i);
    expect(r.body.length).toBeLessThan(JS.length);
  });

  it("sends the plain file to clients without compression support", async () => {
    const r = await raw("/assets/index-abc.js");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.body.toString()).toBe(JS);
    expect(r.headers["cache-control"]).toContain("immutable");
  });

  it("serves the SPA shell for app routes, never cached", async () => {
    const r = await raw("/tasks/12");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/html/);
    expect(r.headers["cache-control"]).toBe("no-cache");
  });

  it("a missing hashed asset is a 404, not the HTML shell", async () => {
    const r = await raw("/assets/index-OLD.js");
    expect(r.status).toBe(404);
  });

  it("can't read outside dist", async () => {
    const r = await raw("/..%2Fcp-secret.txt", { "accept-encoding": "br" });
    expect(r.body.toString()).not.toContain("secret");
  });
});
