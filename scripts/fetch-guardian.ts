// Fetch Guardian crosswords. Each puzzle's data is embedded in its page's
// `.json` model (no auth). Per type we read the current number from the series
// page, then walk back by number — consecutive numbers are consecutive issues —
// labelling each by its own publication date, until we hit one we already have
// or fall past the date window.
//
// Run: npm run fetch:guardian [days]   (default 14 days back)
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseGuardian } from "./parse-guardian.ts";
import { rebuildIndex, PUZZLE_DIR } from "./build-index.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const SITE = "https://www.theguardian.com/crosswords";

const TYPES: Array<{ source: PuzzleSource; slug: string }> = [
  { source: "gdn-quick", slug: "quick" },
  { source: "gdn-cryptic", slug: "cryptic" },
  { source: "gdn-quiptic", slug: "quiptic" },
  { source: "gdn-quick-cryptic", slug: "quick-cryptic" },
  { source: "gdn-prize", slug: "prize" },
];

const DAYS = Number(process.argv[2]) || 14;
const MAX_PER_TYPE = DAYS + 5; // safety cap on how far back to walk

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Highest (most recent) puzzle number for a type, from its series page. */
async function headNumber(slug: string): Promise<number | null> {
  const html = await fetchText(`${SITE}/series/${slug}`);
  const nums = [...html.matchAll(new RegExp(`/crosswords/${slug}/(\\d+)`, "g"))].map(
    (m) => Number(m[1]),
  );
  return nums.length ? Math.max(...nums) : null;
}

/** YYYYMMDD `days` ago (UTC). */
function cutoffYmd(days: number): string {
  const dt = new Date(Date.now() - days * 86_400_000);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchType(
  source: PuzzleSource,
  slug: string,
  cutoff: string,
): Promise<number> {
  const dir = join(PUZZLE_DIR, source);
  await mkdir(dir, { recursive: true });
  const head = await headNumber(slug);
  if (head == null) {
    console.error(`  ${source} — no puzzles found on series page`);
    return 0;
  }
  let added = 0;
  for (let i = 0, n = head; i < MAX_PER_TYPE && n > 0; i++, n--) {
    let puzzle;
    try {
      puzzle = parseGuardian(await fetchText(`${SITE}/${slug}/${n}.json`), source);
    } catch (err) {
      console.error(`  ${source} #${n} — FAILED: ${(err as Error).message}`);
      await sleep(300);
      continue;
    }
    if (puzzle.date < cutoff) break; // walked past the window
    const file = join(dir, `${puzzle.date}.json`);
    if (existsSync(file)) break; // already have this and (assumed) older ones
    await writeFile(file, JSON.stringify(puzzle), "utf8");
    console.log(`  ${source} ${puzzle.date} (#${n}) — ${puzzle.width}x${puzzle.height}`);
    added++;
    await sleep(300);
  }
  return added;
}

async function main(): Promise<void> {
  const cutoff = cutoffYmd(DAYS);
  let added = 0;
  for (const { source, slug } of TYPES) {
    added += await fetchType(source, slug, cutoff);
  }
  const total = await rebuildIndex();
  console.log(`Done. ${added} new puzzle(s) added. Index has ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
