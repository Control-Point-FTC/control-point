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

const ENCODINGS: { name: string; ext: string }[] = [
  { name: "br", ext: ".br" },
  { name: "gzip", ext: ".gz" },
];

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (urlPath === "/" || urlPath.endsWith(".html") || urlPath === "/sw.js") return "no-cache";
  return "public, max-age=3600";
}

/** Pick a pre-compressed variant for `file` the client accepts, if one exists. */
export function pickEncoding(acceptEncoding: string, file: string, exists: (p: string) => boolean = fs.existsSync): { name: string; ext: string } | null {
  const accepted = acceptEncoding.toLowerCase();
  for (const enc of ENCODINGS) {
    // "br;q=0" means refused.
    const m = new RegExp(`(?:^|,)\\s*${enc.name}\\s*(?:;\\s*q=([0-9.]+))?`).exec(accepted);
    if (!m || (m[1] !== undefined && Number(m[1]) === 0)) continue;
    if (exists(file + enc.ext)) return enc;
  }
  return null;
}

export function serveDist(app: express.Express, distDir: string) {
  const root = path.resolve(distDir);
  const indexFile = path.join(root, "index.html");

  const sendIndex = (req: express.Request, res: express.Response) => {
    res.setHeader("Cache-Control", "no-cache");
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
    res.sendFile(file + enc.ext, (err) => { if (err) next(); });
  });

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
  app.get("*", (req, res) => {
    if (req.path.startsWith("/assets/")) return res.status(404).type("text").send("Not found");
    sendIndex(req, res);
  });
}
