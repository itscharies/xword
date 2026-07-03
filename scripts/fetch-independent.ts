// Fetch the Independent's daily cryptic crossword from Arkadium's per-day XML
// feed (no auth). The feed is keyed by plain YYMMDD date, so — unlike the
// Guardian's numbered-issue walk — we just request the last N days directly.
//
// Run: npm run fetch:independent [days]   (default 35 days back)
import { parseIndependent } from "./parse-independent.ts";
import { existingDates, saveSyndicatedPuzzle } from "./puzzleStore.ts";

const SOURCE = "ind-cryptic" as const;
const FEED =
  "https://ams.cdn.arkadiumhosted.com/assets/gamesfeed/independent/daily-crossword/c_";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "xword-fetcher/0.1 (personal crossword app)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
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

const BACKFILL_DAYS = Number(process.argv[2]) || 35;

async function main(): Promise<void> {
  const have = await existingDates(SOURCE);

  let added = 0;
  for (const date of recentDates(BACKFILL_DAYS)) {
    if (have.has(date)) {
      console.log(`  ${date} — already have it, skipping`);
      continue;
    }
    try {
      const xml = await fetchText(`${FEED}${date}.xml`);
      const puzzle = parseIndependent(xml, SOURCE, date);
      await saveSyndicatedPuzzle(SOURCE, puzzle);
      console.log(`  ${date} — fetched "${puzzle.title}" by ${puzzle.author}`);
      added++;
    } catch (err) {
      console.error(`  ${date} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400); // be polite to the source
  }

  console.log(`Done. ${added} new puzzle(s) added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
