import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoFromYmd(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function decodeEntities(s: string): string {
  return s
    // The AMU feed percent-encodes some chars (e.g. "%26" for "&"). Decode
    // valid %XX sequences, leaving a stray "%" (as in "50%") untouched.
    .replace(/%[0-9A-Fa-f]{2}/g, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return m;
      }
    })
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Read `<Tag v="…" />` style single-value fields. */
function field(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}\\s+v="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

interface UclickClue {
  a: string;
  c: string;
  n: number;
  cn: number;
}

/** Pull the `<aN .../>` or `<dN .../>` entries from one section. */
function clues(section: string): UclickClue[] {
  const out: UclickClue[] = [];
  const re = /<[ad]\d+\s+([^>]+?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const attrs = m[1];
    const get = (k: string) => {
      const am = attrs.match(new RegExp(`${k}="([^"]*)"`));
      return am ? am[1] : "";
    };
    out.push({
      a: decodeEntities(get("a")).toUpperCase(),
      c: decodeEntities(get("c")),
      n: Number(get("n")),
      cn: Number(get("cn")),
    });
  }
  return out;
}

/**
 * Parse a uclick crossword XML (used by Andrews McMeel for the LA Times daily)
 * into our Puzzle shape. `AllAnswer` is the grid row-major with "-" for black;
 * each clue carries its answer, text, 1-based linear cell position `n`, and
 * display number `cn`.
 */
export function parseUclick(
  xml: string,
  source: PuzzleSource,
  date: string,
): Puzzle {
  const width = Number(field(xml, "Width"));
  const height = Number(field(xml, "Height"));
  if (!width || !height) throw new Error(`${date}: bad dimensions`);

  const all = field(xml, "AllAnswer");
  const isBlack = (ch: string) => ch === "-" || ch === "." || ch === " ";

  const grid: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      const ch = all[r * width + c];
      row.push(isBlack(ch) ? { black: true } : { solution: ch.toUpperCase() });
    }
    grid.push(row);
  }

  const acrossSection = xml.match(/<across>([\s\S]*?)<\/across>/i)?.[1] ?? "";
  const downSection = xml.match(/<down>([\s\S]*?)<\/down>/i)?.[1] ?? "";

  const toClue = (u: UclickClue): Clue => {
    const row = Math.floor((u.n - 1) / width);
    const col = (u.n - 1) % width;
    if (grid[row]?.[col] && !grid[row][col].black) grid[row][col].number = u.cn;
    return { number: u.cn, clue: u.c, answer: u.a, row, col, len: u.a.length };
  };

  const across = clues(acrossSection).map(toClue).sort((a, b) => a.number - b.number);
  const down = clues(downSection).map(toClue).sort((a, b) => a.number - b.number);

  const iso = isoFromYmd(date);
  const author = field(xml, "Author").replace(/^by\s+/i, "").trim();
  const editor = field(xml, "Editor").replace(/^by\s+/i, "").trim();

  return {
    source,
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title: field(xml, "Title") || "LA Times Crossword",
    author,
    editor,
    width,
    height,
    grid,
    clues: { across, down },
  };
}
