// Post-build: list the files the service worker downloads ahead of time, so
// Compete (Team Stats, Scout, Predict) plus Tasks and Calendar open with no
// connection even on a device that never visited them online.
//
// Reads Vite's build manifest and follows each page's static imports (its
// chunk, shared chunks and CSS). Writes dist/sw-precache.json. Run by
// `npm run build` after `vite build`.
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DIST = process.argv[2] || "dist";
const MANIFEST = join(DIST, ".vite", "manifest.json");

/** Pages that must open offline (owner: Compete fully offline; tasks and calendar read-only). */
export const OFFLINE_PAGES = [
  "src/modern/pages/stats/TeamStatsPage.tsx",
  "src/modern/pages/predict/PredictPage.tsx",
  "src/modern/pages/tasks/TasksPage.tsx",
  "src/modern/pages/calendar/CalendarPage.tsx",
  // Loaded on demand for offline Predict (the forecast runs on the device).
  "src/utils/offlineForecast.ts",
];

/** Every file a manifest entry needs (static imports followed transitively). */
export function precacheList(manifest, pages) {
  const out = new Set();
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    const m = manifest[key];
    out.add("/" + m.file);
    for (const c of m.css || []) out.add("/" + c);
    for (const i of m.imports || []) visit(i);
  };
  for (const [key, m] of Object.entries(manifest)) if (m.isEntry) visit(key);
  for (const p of pages) visit(p);
  return [...out].sort();
}

if (process.argv[1] && process.argv[1].endsWith("sw-precache.mjs")) {
  if (!existsSync(MANIFEST)) {
    console.error(`sw-precache: ${MANIFEST} not found (build.manifest must be on)`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const missing = OFFLINE_PAGES.filter((p) => !manifest[p]);
  if (missing.length) console.warn(`sw-precache: not in the build (renamed?): ${missing.join(", ")}`);
  const files = precacheList(manifest, OFFLINE_PAGES);
  writeFileSync(join(DIST, "sw-precache.json"), JSON.stringify({ files }));
  // The build manifest (source paths) is only needed here: don't publish it.
  rmSync(join(DIST, ".vite"), { recursive: true, force: true });
  console.log(`sw-precache: ${files.length} files`);
}
