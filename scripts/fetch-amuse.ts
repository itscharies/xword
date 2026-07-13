// Fetch Seattle Times crosswords from AmuseLabs (PuzzleMe), parse them to JSON,
// and write them under public/puzzles/<source>/. Existing puzzles are skipped.
//
// Three live sets, two id schemes:
//   st-large  dated   seattle-crossword_YYYYMMDD
//   st-mini   dated   seattle-crossword-mini-YYYYMMDD
//   st-midi   serial  midi-crossword-<N>  (anchored, labelled by publishTime)
//
// Run: npm run fetch:amuse [days]   (default 21 days back)
import { parseAmuse, extractRawc, decodeRawc } from "./parse-amuse.ts";
import { ensureDescrambler } from "./amuse-heal.ts";
import { existingDates, saveSyndicatedPuzzle } from "./puzzleStore.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const HOST = "https://seattletimes.amuselabs.com/puzzleme/crossword";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function url(set: string, id: string): string {
  return `${HOST}?id=${id}&set=${set}&embed=1`;
}

/** YYYYMMDD strings for the last `n` days ending today (UTC), newest first. */
function recentYmd(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    out.push(ymdFromDate(dt));
  }
  return out;
}

function ymdFromDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

const DAYS = Number(process.argv[2]) || 21;

/** A dated set: one puzzle per YYYYMMDD, id built straight from the date. */
async function fetchDated(
  source: PuzzleSource,
  set: string,
  idFor: (ymd: string) => string,
): Promise<number> {
  const have = await existingDates(source);
  let added = 0;
  for (const ymd of recentYmd(DAYS)) {
    if (have.has(ymd)) continue;
    try {
      const pageUrl = url(set, idFor(ymd));
      const html = await fetchText(pageUrl);
      const rawc = extractRawc(html);
      if (!rawc) continue; // not published yet
      await ensureDescrambler(rawc, html, pageUrl);
      const puzzle = parseAmuse(rawc, source, ymd);
      await saveSyndicatedPuzzle(source, puzzle);
      console.log(`  ${source} ${ymd} — "${puzzle.title}"`);
      added++;
    } catch (err) {
      console.error(`  ${source} ${ymd} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400);
  }
  return added;
}

// The midi set uses a sequential id with no date in it, so anchor a known
// (id, date) pair and label each fetched puzzle by its own publishTime.
const MIDI_SET = "seattletimes-crossword-midi";
const MIDI_ANCHOR = { id: 168, ymd: "20260628" };

function daysSinceUtc(ymd: string): number {
  const anchor = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - anchor) / 86_400_000);
}

/** Probe down from an estimate to the highest id that still has a puzzle. */
async function findMidiHead(): Promise<number | null> {
  const est = MIDI_ANCHOR.id + daysSinceUtc(MIDI_ANCHOR.ymd) + 2;
  for (let id = est; id > est - 12 && id > 0; id--) {
    try {
      if (extractRawc(await fetchText(url(MIDI_SET, `midi-crossword-${id}`)))) {
        return id;
      }
    } catch {
      /* keep probing */
    }
    await sleep(300);
  }
  return null;
}

async function fetchMidi(): Promise<number> {
  const have = await existingDates("st-midi");
  const head = await findMidiHead();
  if (head == null) {
    console.error("  st-midi — could not locate current puzzle id");
    return 0;
  }
  let added = 0;
  for (let id = head; id > head - DAYS && id > 0; id--) {
    try {
      const pageUrl = url(MIDI_SET, `midi-crossword-${id}`);
      const html = await fetchText(pageUrl);
      const rawc = extractRawc(html);
      if (!rawc) continue;
      await ensureDescrambler(rawc, html, pageUrl);
      const pub = decodeRawc(rawc).publishTime;
      if (!pub) continue;
      const ymd = ymdFromDate(new Date(pub));
      if (have.has(ymd)) continue;
      const puzzle = parseAmuse(rawc, "st-midi", ymd);
      await saveSyndicatedPuzzle("st-midi", puzzle);
      console.log(`  st-midi ${ymd} (#${id}) — "${puzzle.title}"`);
      added++;
    } catch (err) {
      console.error(`  st-midi #${id} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400);
  }
  return added;
}

async function main(): Promise<void> {
  let added = 0;
  added += await fetchDated(
    "st-large",
    "seattletimes-crossword-large",
    (ymd) => `seattle-crossword_${ymd}`,
  );
  added += await fetchDated(
    "st-mini",
    "seattletimes-crossword-mini",
    (ymd) => `seattle-crossword-mini-${ymd}`,
  );
  added += await fetchMidi();

  console.log(`Done. ${added} new puzzle(s) added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
