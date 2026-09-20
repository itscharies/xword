// Generates dist/sw-manifest.json after `vite build` — the list of built
// app-shell assets for public/sw.js to precache, plus a version string that
// changes on every build so a deploy gets a fresh cache name instead of
// silently reusing (and never invalidating) a stale one. Run as part of
// `npm run build`; see package.json.

import { createHash } from "node:crypto";
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// The app shell: index.html plus everything Vite emitted under assets/
// (content-hashed JS/CSS/worker chunks, so cache-first is always safe) —
// not 404.html (the GitHub-Pages-only SPA redirect trick, never loaded by
// this app itself) or sw.js (the service worker manages its own script
// caching; it doesn't belong in Cache Storage too). Plus the handful of
// static files the manifest/home-screen icon need. Deliberately not
// everything in dist/ — puzzle data and social share images don't belong in
// the shell precache; offline puzzle content is handled per-puzzle by the
// IndexedDB cache in src/lib/offlineCache.ts.
const EXTRA_FILES = ["manifest.webmanifest", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];

const shellAssets = walk(dist)
  .map((f) => relative(dist, f).split(sep).join("/"))
  .filter((p) => p === "index.html" || p.startsWith("assets/"));

const extraAssets = EXTRA_FILES.filter((f) => existsSync(join(dist, f)));

const assets = [...new Set([...shellAssets, ...extraAssets])].sort();

// The git commit in CI, so a real deploy always gets a distinct version even
// if the asset list is somehow unchanged; falls back to a hash of the asset
// list itself for local builds (`npm run build && npm run preview`).
const version =
  process.env.GITHUB_SHA?.slice(0, 12) ??
  createHash("sha256").update(assets.join(",")).digest("hex").slice(0, 12);

writeFileSync(join(dist, "sw-manifest.json"), JSON.stringify({ version, assets }, null, 2));
console.log(`[build-sw-manifest] wrote sw-manifest.json — version ${version}, ${assets.length} assets`);
