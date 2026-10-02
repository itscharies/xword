// Stamps dist/sw.js after `vite build` — bakes the list of built app-shell
// assets for the worker to precache, plus a version string that changes on
// every build, straight into the worker's source (the `@xword-build` marker
// line in public/sw.js). Baking rather than emitting a sidecar manifest means
// the worker never needs the network to know its own cache name, and every
// deploy changes sw.js's bytes so the browser actually re-installs it. Run
// as part of `npm run build`; see package.json.

import { createHash } from "node:crypto";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");
const swPath = join(dist, "sw.js");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// The app shell: index.html, everything Vite emitted under assets/
// (content-hashed JS/CSS/worker chunks, so cache-first is always safe), and
// the self-hosted font files under fonts/ (see scripts/fetch-fonts.ts) —
// not 404.html (the GitHub-Pages-only SPA redirect trick, never loaded by
// this app itself) or sw.js (the service worker manages its own script
// caching; it doesn't belong in Cache Storage too). Plus the handful of
// static files the manifest/home-screen icon need. Deliberately not
// everything in dist/ — puzzle data and social share images don't belong in
// the shell precache; offline puzzle content is handled per-puzzle by the
// Cache API store in src/lib/offlineCache.ts.
const EXTRA_FILES = ["manifest.webmanifest", "favicon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];

const shellAssets = walk(dist)
  .map((f) => relative(dist, f).split(sep).join("/"))
  .filter((p) => p === "index.html" || p.startsWith("assets/") || p.startsWith("fonts/"));

const extraAssets = EXTRA_FILES.filter((f) => existsSync(join(dist, f)));

const assets = [...new Set([...shellAssets, ...extraAssets])].sort();

// The git commit in CI, so a real deploy always gets a distinct version even
// if the asset list is somehow unchanged; falls back to a hash of the asset
// list itself for local builds (`npm run build && npm run preview`).
const version =
  process.env.GITHUB_SHA?.slice(0, 12) ??
  createHash("sha256").update(assets.join(",")).digest("hex").slice(0, 12);

// Exactly one marker line, matched strictly — a worker that shipped without
// its stamp would install nothing and serve nothing offline, so refuse to
// produce one.
const MARKER = /^const BUILD = \/\*@xword-build\*\/ null;$/gm;
const source = readFileSync(swPath, "utf8");
const matches = source.match(MARKER) ?? [];
if (matches.length !== 1) {
  console.error(`[build-sw] expected exactly one @xword-build marker in ${swPath}, found ${matches.length}`);
  process.exit(1);
}

const stamped = source.replace(MARKER, `const BUILD = ${JSON.stringify({ version, assets })};`);
writeFileSync(swPath, stamped);
console.log(`[build-sw] stamped sw.js — version ${version}, ${assets.length} assets`);
