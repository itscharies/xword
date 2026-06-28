// Run every source fetcher in turn. Each runs in its own process, so a crash
// (network error, bad payload, upstream change) in one can't stop the others.
// Always rebuilds the unified index at the end and exits 0, so the daily cron
// still commits whatever was fetched even if a source failed.
//
// Run: npm run fetch
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuildIndex } from "./build-index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = join(here, "..", "node_modules", ".bin", "tsx");

const FETCHERS = [
  "fetch-puzzles",
  "fetch-amuse",
  "fetch-latimes",
  "fetch-guardian",
  "fetch-newyorker",
];

const failed: string[] = [];
for (const f of FETCHERS) {
  console.log(`\n=== ${f} ===`);
  const res = spawnSync(tsx, [join(here, `${f}.ts`)], { stdio: "inherit" });
  if (res.status !== 0 || res.error) {
    failed.push(f);
    console.error(`!! ${f} failed (${res.error?.message ?? `exit ${res.status}`}) — continuing`);
  }
}

const total = await rebuildIndex();
console.log(
  `\nDone. ${FETCHERS.length - failed.length}/${FETCHERS.length} fetchers ok` +
    (failed.length ? ` (failed: ${failed.join(", ")})` : "") +
    `. Index has ${total}.`,
);
