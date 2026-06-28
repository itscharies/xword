// Fetch available NYT-syndicated puzzles from pzzl.com, parse them to JSON,
// and write them under public/puzzles/. Existing puzzles are skipped, so the
// archive only ever grows even after the source list rotates old dates out.
//
// Run: npm run fetch
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parsePuzzle } from "./parse.ts";
import { rebuildIndex, PUZZLE_DIR } from "./build-index.ts";

const BASE =
  "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=";
const LIST_URL = `${BASE}list&get=archivecurrent`;

const NYT_DIR = join(PUZZLE_DIR, "nyt");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The source is served as Windows-1252 (e.g. "soupçon", "50¢"), not UTF-8,
// so decode the raw bytes explicitly to preserve accents and punctuation.
const decoder = new TextDecoder("windows-1252");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "xword-fetcher/0.1 (personal crossword app)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return decoder.decode(await res.arrayBuffer());
}

/** Parse the list endpoint into YYMMDD date strings. */
function parseList(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d{6}$/.test(l));
}

/** YYMMDD strings for the last `n` days ending today (UTC). */
function recentDates(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const yy = String(dt.getUTCFullYear()).slice(2);
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${yy}${mm}${dd}`);
  }
  return out;
}

// How many days to backfill in addition to the list endpoint. The source
// serves older dates directly, so this keeps the archive rich and fills any
// gaps if the cron missed a day. Override with `npm run fetch -- <days>`.
const BACKFILL_DAYS = Number(process.argv[2]) || 35;

async function main(): Promise<void> {
  await mkdir(NYT_DIR, { recursive: true });

  const listed = parseList(await fetchText(LIST_URL));
  console.log(`List endpoint returned ${listed.length} dates.`);

  // Candidate dates: the list plus a backfill window, newest first, deduped.
  const dates = [...new Set([...listed, ...recentDates(BACKFILL_DAYS)])]
    .sort()
    .reverse();

  let added = 0;
  for (const date of dates) {
    const file = join(NYT_DIR, `${date}.json`);
    if (existsSync(file)) {
      console.log(`  ${date} — already have it, skipping`);
      continue;
    }
    try {
      const raw = await fetchText(`${BASE}${date}`);
      const puzzle = parsePuzzle(raw, date);
      await writeFile(file, JSON.stringify(puzzle), "utf8");
      console.log(`  ${date} — fetched "${puzzle.title}"`);
      added++;
    } catch (err) {
      // One bad date shouldn't abort the whole run.
      console.error(`  ${date} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400); // be polite to the source
  }

  const total = await rebuildIndex();
  console.log(`Done. ${added} new puzzle(s) added. Index has ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
