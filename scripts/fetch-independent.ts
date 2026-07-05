// Fetch the Independent's crosswords from Arkadium's per-day feeds (no auth).
// Each feed is keyed by a plain date string, so — unlike the Guardian's
// numbered-issue walk — we just request the last N days directly.
//
// Three feeds, reverse-engineered from the "arena5" game config baked into
// each Arkadium game bundle (arenaxstorage-blob/arenax-games/<sdk>/.../static/js/main.js):
//   - daily cryptic: Crossword Compiler XML, daily
//   - daily mini: Crossword Compiler XML, daily (a shared "arkadiumMini" feed,
//     not Independent-specific content, but it's what the Independent's own
//     Mini page serves)
//   - Sunday: classic AcrossLite .puz binary, published Sundays only
//
// (The Premier Crossword, also on the Independent's site, is served through
// King Features' authenticated API — no public per-day file feed — so it's
// not included here.)
//
// Run: npm run fetch:independent [days]   (default 35 days back)
import { parseIndependent } from "./parse-independent.ts";
import { parsePuz } from "./parse-puz.ts";
import { existingDates, saveSyndicatedPuzzle } from "./puzzleStore.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "xword-fetcher/0.1 (personal crossword app)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "xword-fetcher/0.1 (personal crossword app)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Date objects for the last `n` days ending today (UTC midnight). */
function recentDates(n: number): Date[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)),
  );
}

/** YYMMDD for a Date (UTC). */
function ymd(dt: Date): string {
  const yy = String(dt.getUTCFullYear()).slice(2);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

interface Feed {
  source: PuzzleSource;
  /** Only fetch dates whose UTC day-of-week is in this set (0 = Sunday). Absent means every day. */
  weekdays?: number[];
  url(date: string): string;
  fetchAndParse(date: string): Promise<ReturnType<typeof parseIndependent>>;
}

const FEEDS: Feed[] = [
  {
    source: "ind-cryptic",
    url: (date) =>
      `https://ams.cdn.arkadiumhosted.com/assets/gamesfeed/independent/daily-crossword/c_${date}.xml`,
    async fetchAndParse(date) {
      return parseIndependent(await fetchText(this.url(date)), this.source, date);
    },
  },
  {
    source: "ind-mini",
    url: (date) =>
      `https://ams.cdn.arkadiumhosted.com/assets/gamesfeed/minicrossword/puzzle_mini_${date}.xml`,
    async fetchAndParse(date) {
      return parseIndependent(await fetchText(this.url(date)), this.source, date);
    },
  },
  {
    source: "ind-sunday",
    weekdays: [0],
    url: (date) =>
      `https://ams.cdn.arkadiumhosted.com/assets/gamesfeed/stanley-newman-ftp/sunday/puzzle_${date}.puz`,
    async fetchAndParse(date) {
      return parsePuz(await fetchBuffer(this.url(date)), this.source, date);
    },
  },
];

const BACKFILL_DAYS = Number(process.argv[2]) || 35;

async function fetchFeed(feed: Feed, dates: Date[]): Promise<number> {
  const have = await existingDates(feed.source);
  let added = 0;
  for (const dt of dates) {
    if (feed.weekdays && !feed.weekdays.includes(dt.getUTCDay())) continue;
    const date = ymd(dt);
    if (have.has(date)) {
      console.log(`  ${feed.source} ${date} — already have it, skipping`);
      continue;
    }
    try {
      const puzzle = await feed.fetchAndParse(date);
      await saveSyndicatedPuzzle(feed.source, puzzle);
      console.log(`  ${feed.source} ${date} — fetched "${puzzle.title}" by ${puzzle.author}`);
      added++;
    } catch (err) {
      console.error(`  ${feed.source} ${date} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400); // be polite to the source
  }
  return added;
}

async function main(): Promise<void> {
  const dates = recentDates(BACKFILL_DAYS);
  let added = 0;
  for (const feed of FEEDS) {
    added += await fetchFeed(feed, dates);
  }
  console.log(`Done. ${added} new puzzle(s) added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
