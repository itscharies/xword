import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";
import { SOURCES } from "../src/lib/sources.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** YYYYMMDD -> "YYYY-MM-DD". */
function isoFromYmd(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * AmuseLabs scrambles the base64 `rawc` payload by reversing fixed-size
 * segments in four passes. The transform is its own inverse and uses no
 * per-puzzle key (the segment sizes are hard-coded), so re-applying it
 * descrambles. Ported verbatim from their player's `c-min.js` (`Ol`), including
 * the out-of-bounds tail swaps (JS reads past the end as `undefined`).
 *
 * AmuseLabs revs this transform's constants from time to time (~2026-07-01,
 * ~2026-07-08, ~2026-07-13; each rev breaks every decode) — so the fetchers
 * self-heal via `ensureDescrambler` (amuse-heal.ts), which pulls the current
 * player bundle, extracts the live descrambler (the function passed alongside
 * `flowName` in the `isRawcEncoded` branch — `Ol`, `Il`, then `Pl` across
 * revs) and installs it over this static port. When that happens, the run
 * logs the extracted source: paste its constants into the `pass(...)` calls
 * below to keep the static fallback current.
 */
function descramble(input: string): string {
  const a: (string | undefined)[] = input.split("");
  const L = input.length;
  const get = (i: number) => (i >= 0 && i < a.length ? a[i] : undefined);
  const set = (i: number, v: string | undefined) => {
    while (a.length <= i) a.push(undefined);
    a[i] = v;
  };
  const swap = (x: number, y: number) => {
    const o = get(x);
    set(x, get(y));
    set(y, o);
  };
  // Each pass starts at `start`, advances by `step`, and within each window
  // reverses one or two consecutive blocks. A block's size is `full` unless
  // fewer than `base + 1` chars remain, in which case it runs to the end (+1,
  // matching the original's intentional one-past tail).
  const pass = (
    start: number,
    step: number,
    blocks: Array<[base: number, full: number]>,
  ) => {
    for (let n = start; n < L; n += step) {
      let s = n;
      for (const [base, full] of blocks) {
        const c = base + s < L ? full : L - s + 1;
        for (let r = s, e = s + c - 1; r < e; e--, r++) swap(e, r);
        s += c;
      }
      n = s;
    }
  };
  pass(38, 57, [[16, 17]]);
  pass(0, 63, [[10, 11]]);
  pass(55, 55, [
    [14, 15],
    [3, 4],
  ]);
  pass(11, 47, [
    [5, 6],
    [3, 4],
    [16, 17],
  ]);
  return a.map((c) => c ?? "").join("");
}

/** A descrambler auto-ported from the live player bundle (see amuse-heal.ts);
 *  when installed it takes precedence over the static port above. */
let installedDescramble: ((s: string) => string) | null = null;

export function installDescramble(fn: (s: string) => string): void {
  installedDescramble = fn;
}

function decodeWith(fn: (s: string) => string, rawc: string): AmuseRaw {
  const json = Buffer.from(fn(rawc), "base64").toString("utf8");
  return JSON.parse(json) as AmuseRaw;
}

/** Decode a `rawc` blob into the AmuseLabs puzzle JSON. */
export function decodeRawc(rawc: string): AmuseRaw {
  if (installedDescramble) {
    try {
      return decodeWith(installedDescramble, rawc);
    } catch {
      /* fall through to the static port */
    }
  }
  return decodeWith(descramble, rawc);
}

/** Whether `rawc` decodes with any descrambler we currently have. */
export function canDecodeRawc(rawc: string): boolean {
  try {
    decodeRawc(rawc);
    return true;
  } catch {
    return false;
  }
}

interface AmusePlacedWord {
  word: string;
  x: number;
  y: number;
  nBoxes: number;
  acrossNotDown: boolean;
  clueNum: string;
  clue?: { clue?: string };
}

interface AmuseRaw {
  title?: string;
  author?: string;
  copyright?: string;
  publishTime?: number;
  w: number;
  h: number;
  box: (string | null)[][];
  clueNums?: (string | null)[][];
  placedWords: AmusePlacedWord[];
  cellInfos?: Array<{ x: number; y: number; isCircled?: boolean }>;
}

/** "Copyright © 2026 Penny Press, Inc" -> "Penny Press". */
function publisherFromCopyright(copyright?: string): string {
  if (!copyright) return "";
  return copyright
    .replace(/^\s*copyright\s*/i, "")
    .replace(/©/g, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/,?\s*Inc\.?$/i, "")
    .trim();
}

/** A title that's just a date ("Sun, Jun 28, 2026") carries no real theme. */
function isDateOnlyTitle(title: string): boolean {
  return /^[A-Za-z]{3,},?\s.*\d{4}\s*$/.test(title.trim());
}

/** Pull the `rawc` payload out of an AmuseLabs player HTML page. */
export function extractRawc(html: string): string | null {
  const m = html.match(/"rawc"\s*:\s*"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Parse an AmuseLabs `rawc` blob into our Puzzle shape.
 * `date` is the source-native YYYYMMDD id.
 */
export function parseAmuse(
  rawc: string,
  source: PuzzleSource,
  date: string,
): Puzzle {
  const o = decodeRawc(rawc);

  // Guard against a payload that doesn't match the date we asked for (e.g. the
  // source returning the latest puzzle for an unpublished date). Tolerate a
  // 1-day timezone skew between publishTime and the date id.
  if (o.publishTime) {
    const got = new Date(o.publishTime);
    const want = new Date(isoFromYmd(date) + "T00:00:00Z");
    const skewDays = Math.abs(got.getTime() - want.getTime()) / 86_400_000;
    if (skewDays > 1.5) {
      throw new Error(
        `${date}: payload publishTime ${got.toISOString().slice(0, 10)} != requested date`,
      );
    }
  }

  const { w, h, box } = o;

  const isBlack = (v: string | null | undefined) =>
    v == null || v === "" || v === "\u0000" || v === "-" || v === ".";

  // box is column-major: box[x][y]. Likewise clueNums[x][y].
  const grid: Cell[][] = [];
  for (let y = 0; y < h; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < w; x++) {
      const v = box[x]?.[y];
      if (isBlack(v)) {
        row.push({ black: true });
        continue;
      }
      const sol = String(v).toUpperCase();
      const cell: Cell = { solution: sol };
      if (sol.length > 1) cell.rebus = true;
      // Some sets use null for unnumbered cells, others use "0" — treat both
      // as "no number".
      const num = Number(o.clueNums?.[x]?.[y]);
      if (num > 0) cell.number = num;
      row.push(cell);
    }
    grid.push(row);
  }

  // Circled cells, if the puzzle marks any.
  for (const ci of o.cellInfos ?? []) {
    if (ci.isCircled && grid[ci.y]?.[ci.x] && !grid[ci.y][ci.x].black) {
      grid[ci.y][ci.x].circled = true;
    }
  }

  const across: Clue[] = [];
  const down: Clue[] = [];
  for (const p of o.placedWords) {
    const clue: Clue = {
      number: Number(p.clueNum),
      clue: p.clue?.clue ?? "",
      answer: String(p.word).toUpperCase(),
      row: p.y,
      col: p.x,
      len: p.nBoxes,
    };
    (p.acrossNotDown ? across : down).push(clue);
  }
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);

  const iso = isoFromYmd(date);
  const rawTitle = (o.title ?? "").trim();
  // These syndicated dailies title themselves with just the date; show the
  // collection name instead and keep any genuine theme title.
  const title =
    !rawTitle || isDateOnlyTitle(rawTitle) ? SOURCES[source].label : rawTitle;
  const author = (o.author ?? "").trim() || publisherFromCopyright(o.copyright);

  return {
    source,
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title,
    author,
    editor: "",
    width: w,
    height: h,
    grid,
    clues: { across, down },
  };
}
