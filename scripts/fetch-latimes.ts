// Fetch the LA Times daily crossword from the LA Times' own AmuseLabs
// (PuzzleMe) instance — the same platform as the Seattle Times sets, so the
// shared descrambler/parser handles it, including circled cells, which the
// old Andrews McMeel uclick XML feed didn't carry at all.
//
// Access dance: the player URL 302s to latimes.com unless the request carries
// a loadToken — a JWT minted fresh on every date-picker load — plus `fvlt`,
// the offline-verification checksum the picker's JS appends when its ad-status
// POST fails (the char-code sums of set, puzzle id and the token's uid,
// XOR'd, in hex). The picker page itself loads without any auth and hands us
// the token in its base64 `rawsps` blob.
//
// Ids are date-derived (`tcaYYMMDD` — TCA = Tribune Content Agency), so we
// probe recent dates directly rather than reading the picker's 14-day list;
// the server serves ids well past that window, which also enables backfill.
//
// Run: npm run fetch:latimes [days] [--refetch]
//   days      how far back to look (default 21)
//   --refetch re-parse and overwrite dates we already have (the store upserts)
import { parseAmuse, extractRawc } from "./parse-amuse.ts";
import { ensureDescrambler } from "./amuse-heal.ts";
import { existingDates, saveSyndicatedPuzzle } from "./puzzleStore.ts";
import { SOURCES } from "../src/lib/sources.ts";
import type { Puzzle } from "../src/types.ts";

const HOST = "https://lat.amuselabs.com/lat";
const SET = "latimes";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Decode a base64/base64url JSON blob (the picker config, JWT payloads). */
function b64Json<T>(b64: string): T {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as T;
}

/** Load the date-picker and pull out the session loadToken and its uid. */
async function pickerSession(): Promise<{ token: string; uid: string }> {
  const html = await fetchText(`${HOST}/date-picker?set=${SET}`);
  const m = html.match(/"rawsps"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error("date-picker page had no rawsps config blob");
  const { loadToken } = b64Json<{ loadToken?: string }>(m[1]);
  if (!loadToken) throw new Error("picker config had no loadToken");
  const { uid } = b64Json<{ uid?: string }>(loadToken.split(".")[1] ?? "");
  if (!uid) throw new Error("loadToken payload had no uid");
  return { token: loadToken, uid };
}

/** Uint32 sum of char codes — one leg of the fvlt checksum. */
function charSum(s: string): number {
  let t = 0;
  for (let i = 0; i < s.length; i++) t = (t + s.charCodeAt(i)) >>> 0;
  return t;
}

function playerUrl(id: string, token: string, uid: string): string {
  const fvlt = ((charSum(SET) ^ charSum(id) ^ charSum(uid)) >>> 0).toString(16);
  return `${HOST}/crossword?id=${id}&set=${SET}&embed=1&loadToken=${token}&fvlt=${fvlt}`;
}

/** YYYYMMDD for the last `n` days ending today (UTC), newest first. */
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

/**
 * LAT-specific cleanup on the generic AmuseLabs parse: the feed titles every
 * puzzle "L. A. Times, <date>" with the Sunday theme quoted after a dash, and
 * packs the editor into the author ("Jane Doe / Ed. Patti Varol").
 */
function polish(p: Puzzle): Puzzle {
  const edSplit = p.author.split(/\s*\/\s*Ed\.\s*/i);
  if (edSplit.length === 2) {
    p.author = edSplit[0].trim();
    p.editor = edSplit[1].trim();
  }
  const theme = p.title.match(/^L\.\s?A\.\s?Times.*?-\s*"(.+)"\s*$/);
  if (theme) p.title = theme[1];
  else if (/^L\.\s?A\.\s?Times\b/.test(p.title)) p.title = SOURCES.latimes.label;
  return p;
}

const DAYS = Number(process.argv.find((a) => /^\d+$/.test(a))) || 21;
const REFETCH = process.argv.includes("--refetch");

async function main(): Promise<void> {
  const have = REFETCH ? new Set<string>() : await existingDates("latimes");
  const { token, uid } = await pickerSession();

  let added = 0;
  for (const ymd of recentYmd(DAYS)) {
    if (have.has(ymd)) continue;
    const id = `tca${ymd.slice(2)}`;
    try {
      const pageUrl = playerUrl(id, token, uid);
      const html = await fetchText(pageUrl);
      const rawc = extractRawc(html);
      if (!rawc) continue; // not published yet (or an error page — no payload)
      await ensureDescrambler(rawc, html, pageUrl);
      const puzzle = polish(parseAmuse(rawc, "latimes", ymd));
      await saveSyndicatedPuzzle("latimes", puzzle);
      const circles = puzzle.grid.flat().filter((c) => c.circled).length;
      console.log(
        `  latimes ${ymd} — "${puzzle.title}" by ${puzzle.author}` +
          (circles ? ` (${circles} circled)` : ""),
      );
      added++;
    } catch (err) {
      console.error(`  latimes ${ymd} — FAILED: ${(err as Error).message}`);
    }
    await sleep(400);
  }

  console.log(`Done. ${added} new puzzle(s) added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
