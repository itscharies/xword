// Run every source fetcher in turn. Each runs in its own process, so a crash
// (network error, bad payload, upstream change) in one can't stop the
// others. Each writes straight to Supabase as it goes (see puzzleStore.ts),
// so a new puzzle is live the moment its fetcher saves it — nothing here
// needs to commit or trigger a deploy.
//
// Run: npm run fetch
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = join(here, "..", "node_modules", ".bin", "tsx");

const FETCHERS = [
  "fetch-puzzles",
  "fetch-amuse",
  "fetch-latimes",
  "fetch-guardian",
  "fetch-newyorker",
  "fetch-independent",
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

console.log(
  `\nDone. ${FETCHERS.length - failed.length}/${FETCHERS.length} fetchers ok` +
    (failed.length ? ` (failed: ${failed.join(", ")})` : "") +
    `.`,
);

if (failed.length) process.exit(1);
