// Production static serving for the built SPA (dist/).
//
// - Pre-compressed variants (.br / .gz, written at build time by
//   scripts/compress-dist.mjs) are sent when the browser accepts them.
// - Cache policy: content-hashed files under /assets/ never change, so they
//   are cached for a year (immutable). index.html and sw.js must always be
//   revalidated so a deploy is picked up on the next load. Everything else
//   (icons, manifest, fonts, wasm) is cached briefly.
import express from "express";
import fs from "fs";
import path from "path";
import { isKnownRoute, withHead, publicHeadFor, NOT_FOUND_HEAD } from "../src/utils/publicRoutes.js";

const ENCODINGS: { name: string; ext: string }[] = [
  { name: "br", ext: ".br" },
  { name: "gzip", ext: ".gz" },
];

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (urlPath === "/" || urlPath.endsWith(".html") || urlPath === "/sw.js") return "no-cache";
  return "public, max-age=3600";
}

/** The client's quality value for an encoding (0 = refused / not listed). */
function qualityOf(acceptEncoding: string, name: string): number {
  let best = 0;
  for (const part of acceptEncoding.toLowerCase().split(",")) {
    const [token, ...params] = part.trim().split(";");
    if (token.trim() !== name && token.trim() !== "*") continue;
    const qp = params.map((x) => x.trim()).find((x) => x.startsWith("q="));
    const q = qp ? Number(qp.slice(2)) : 1;
    // An exact token outranks a "*" wildcard entry.
    if (token.trim() === name) return Number.isFinite(q) ? q : 0;
    best = Number.isFinite(q) ? q : 0;
  }
  return best;
}

/** Pick the pre-compressed variant for `file` the client prefers (by q
 *  value; Brotli wins ties because it is smaller), if one exists. */
export function pickEncoding(acceptEncoding: string, file: string, exists: (p: string) => boolean = fs.existsSync): { name: string; ext: string } | null {
  const ranked = ENCODINGS
    .map((enc, i) => ({ enc, q: qualityOf(acceptEncoding, enc.name), i }))
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { enc } of ranked) if (exists(file + enc.ext)) return enc;
  return null;
}

export function serveDist(app: express.Express, distDir: string, opts: { csp?: { header: string; value: string }; siteUrl?: string } = {}) {
  const root = path.resolve(distDir);
  const indexFile = path.join(root, "index.html");

  // index.html with route-specific head tags (public pages, 404). Read once
  // per deploy: the file only changes when the mtime does.
  let shell: { mtimeMs: number; html: string } | null = null;
  const readShell = (): string => {
    const mtimeMs = fs.statSync(indexFile).mtimeMs;
    if (!shell || shell.mtimeMs !== mtimeMs) shell = { mtimeMs, html: fs.readFileSync(indexFile, "utf8") };
    return shell.html;
  };
  const sendShell = (res: express.Response, status: number, head: { title: string; description: string }, urlPath?: string) => {
    res.setHeader("Cache-Control", "no-cache");
    if (opts.csp) res.setHeader(opts.csp.header, opts.csp.value);
    let html: string;
    try { html = readShell(); } catch { return res.status(status).type("text").send(status === 404 ? "Not found" : "Unavailable"); }
    const url = opts.siteUrl && urlPath ? opts.siteUrl.replace(/\/$/, "") + urlPath : undefined;
    res.status(status).type("html").send(withHead(html, head, url));
  };

  const sendIndex = (req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-cache");
    // The page's Content-Security-Policy (report-only until enforced).
    if (opts.csp) res.setHeader(opts.csp.header, opts.csp.value);
    res.setHeader("Vary", "Accept-Encoding");
    const enc = pickEncoding(String(req.headers["accept-encoding"] || ""), indexFile);
    if (enc) {
      res.setHeader("Content-Encoding", enc.name);
      res.type("html");
      return res.sendFile(indexFile + enc.ext);
    }
    res.sendFile(indexFile);
  };

  // Pre-compressed files: map /x.js -> /x.js.br (or .gz) when accepted.
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path === "/" || req.path.startsWith("/api/")) return next();
    let rel: string;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep)) return next(); // no path traversal
    if (path.extname(file) === ".html") return next();
    const enc = pickEncoding(String(req.headers["accept-encoding"] || ""), file);
    if (!enc) return next();
    res.setHeader("Content-Encoding", enc.name);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Cache-Control", cacheControlFor(req.path));
    res.type(path.extname(file));
    res.sendFile(file + enc.ext, (err) => {
      if (!err) return;
      // The compressed copy vanished (e.g. mid-deploy): undo the encoding
      // headers so the fallback below sends plain bytes labelled as such.
      if (res.headersSent) return next(err);
      res.removeHeader("Content-Encoding");
      res.removeHeader("Content-Type");
      next();
    });
  });

  // The page itself always goes through sendIndex (CSP + no-cache), also
  // when asked for by name.
  app.get("/index.html", sendIndex);
  // Browsers and crawlers ask for /favicon.ico by name; the icon is a PNG.
  app.get("/favicon.ico", (_req, res) => res.redirect(301, "/favicon.png"));
  app.use(express.static(root, {
    index: false,
    setHeaders: (res, filePath) => {
      const rel = "/" + path.relative(root, filePath).split(path.sep).join("/");
      res.setHeader("Cache-Control", cacheControlFor(rel));
      res.setHeader("Vary", "Accept-Encoding");
    },
  }));

  // SPA routes. A request for a missing hashed asset (an old tab after a
  // deploy) is a real 404 — never index.html, which would be parsed as JS.
  // Unknown paths still get the app (it renders a not-found page), but with
  // a real 404 status so crawlers and link checkers see the truth.
  app.get("*", (req, res) => {
    if (req.path.startsWith("/assets/")) return res.status(404).type("text").send("Not found");
    if (!isKnownRoute(req.path)) return sendShell(res, 404, NOT_FOUND_HEAD);
    const pub = publicHeadFor(req.path);
    if (pub) return sendShell(res, 200, pub.head, pub.path);
    sendIndex(req, res);
  });
}
