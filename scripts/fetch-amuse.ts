// Fetch Seattle Times crosswords from AmuseLabs (PuzzleMe), parse them to JSON,
// and write them under public/puzzles/<source>/. Existing puzzles are skipped.
//
// Run: npm run fetch:amuse [days]   (default 21 days back)
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseAmuse, extractRawc } from "./parse-amuse.ts";
import { rebuildIndex, PUZZLE_DIR } from "./build-index.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const HOST = "https://seattletimes.amuselabs.com/puzzleme/crossword";

// The AmuseLabs "set" each of our sources maps to. (The non-"large" Seattle
// Times set is deactivated upstream, so it isn't listed here.)
const SET: Record<Exclude<PuzzleSource, "nyt">, string> = {
  "st-large": "seattletimes-crossword-large",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function puzzleUrl(set: string, ymd: string): string {
  return `${HOST}?id=seattle-crossword_${ymd}&set=${set}&embed=1`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** YYYYMMDD strings for the last `n` days ending today (UTC), newest first. */
function recentYmd(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${y}${m}${d}`);
  }
  return out;
}

const DAYS = Number(process.argv[2]) || 21;

async function main(): Promise<void> {
  const dates = recentYmd(DAYS);
  let added = 0;

  for (const source of Object.keys(SET) as Array<keyof typeof SET>) {
    const dir = join(PUZZLE_DIR, source);
    await mkdir(dir, { recursive: true });
    for (const ymd of dates) {
      const file = join(dir, `${ymd}.json`);
      if (existsSync(file)) {
        console.log(`  ${source} ${ymd} — already have it, skipping`);
        continue;
      }
      try {
        const html = await fetchText(puzzleUrl(SET[source], ymd));
        const rawc = extractRawc(html);
        if (!rawc) throw new Error("no rawc in page");
        const puzzle = parseAmuse(rawc, source, ymd);
        await writeFile(file, JSON.stringify(puzzle), "utf8");
        console.log(`  ${source} ${ymd} — fetched "${puzzle.title}"`);
        added++;
      } catch (err) {
        console.error(`  ${source} ${ymd} — FAILED: ${(err as Error).message}`);
      }
      await sleep(400); // be polite to the source
    }
  }

  const total = await rebuildIndex();
  console.log(`Done. ${added} new puzzle(s) added. Index has ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
