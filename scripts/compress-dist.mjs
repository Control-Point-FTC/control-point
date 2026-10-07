// Post-build: write Brotli (.br) and gzip (.gz) copies of every text asset in
// dist/, so the server can send them pre-compressed (no per-request CPU).
// Run by `npm run build` after `vite build`.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const DIST = process.argv[2] || "dist";
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".svg", ".json", ".webmanifest", ".txt", ".wasm", ".map"]);
const MIN_BYTES = 1024;

let files = 0, before = 0, afterBr = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!COMPRESSIBLE.has(extname(name)) || st.size < MIN_BYTES) continue;
    const buf = readFileSync(p);
    const br = brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
    });
    const gz = gzipSync(buf, { level: 9 });
    // Only keep a variant that is actually smaller.
    if (br.length < buf.length) writeFileSync(p + ".br", br);
    if (gz.length < buf.length) writeFileSync(p + ".gz", gz);
    files++; before += buf.length; afterBr += Math.min(br.length, buf.length);
  }
}
walk(DIST);
console.log(`compress-dist: ${files} files, ${(before / 1024).toFixed(0)} KB -> ${(afterBr / 1024).toFixed(0)} KB brotli`);
