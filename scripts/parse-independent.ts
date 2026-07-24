import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";
import { SOURCES } from "../src/lib/sources.ts";
import { isoFromYymmdd, weekdayFromIso } from "./dates.ts";

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39);/g, "'");
}

/** "1-9" -> [1, 9]; "2" -> [2, 2] (a single-cell span, along the other axis). */
function parseRange(s: string): [number, number] {
  const [a, b] = s.split("-");
  return [Number(a), Number(b ?? a)];
}

interface WordSpan {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  direction: "across" | "down";
}

/**
 * Parse the Independent's daily cryptic feed — a Crossword Compiler XML
 * payload (crossword.info schema) served from Arkadium's CDN at
 * assets/gamesfeed/independent/daily-crossword/c_<YYMMDD>.xml. The format is
 * flat and attribute-based, so targeted regexes are simpler than pulling in a
 * full XML parser.
 */
export function parseIndependent(xml: string, source: PuzzleSource, date: string): Puzzle {
  // The feed serializes empty elements inconsistently across dates — some as
  // `<cell .../>`, others as `<cell ...></cell>` — even for the same game.
  // Normalize to the self-closing form so the regexes below only need to
  // handle one shape.
  xml = xml.replace(/<([\w-]+)((?:\s+[\w:-]+="[^"]*")*)\s*><\/\1>/g, "<$1$2/>");

  const metadata = xml.match(/<metadata>[\s\S]*?<\/metadata>/)?.[0] ?? "";
  const title = decodeEntities(metadata.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  const creator = decodeEntities(metadata.match(/<creator>([^<]*)<\/creator>/)?.[1] ?? "");
  // The cryptic feed leaves <creator> empty and names the setter in the
  // title instead ("No. 12,399 by Bluebird"); the mini feed does the
  // opposite, populating <creator> and leaving the title generic.
  const author = creator || title.match(/\bby\s+(.+)$/)?.[1]?.trim() || "";

  const gridTag = xml.match(/<grid[^>]*>/)?.[0] ?? "";
  const width = Number(attr(gridTag, "width"));
  const height = Number(attr(gridTag, "height"));
  if (!width || !height) throw new Error(`${date}: missing/bad grid dimensions`);

  // Start fully black; <cell> entries carve out the real (non-block) squares.
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ black: true }) as Cell),
  );

  // `\s` after "cell" avoids matching the schema's separate `<cells x="…"
  // y="…"/>` batch-annotation element (e.g. a themed-puzzle shading hint) —
  // its coordinates always duplicate cells already declared individually.
  for (const cellTag of xml.match(/<cell\s[^>]*\/>/g) ?? []) {
    if (attr(cellTag, "type") === "block") continue;
    const row = Number(attr(cellTag, "y")) - 1;
    const col = Number(attr(cellTag, "x")) - 1;
    const cell: Cell = { solution: (attr(cellTag, "solution") ?? "").toUpperCase() };
    const number = attr(cellTag, "number");
    if (number) cell.number = Number(number);
    grid[row][col] = cell;
  }

  const words = new Map<string, WordSpan>();
  for (const wordTag of xml.match(/<word\s[^>]*\/>/g) ?? []) {
    const id = attr(wordTag, "id");
    if (!id) continue;
    const [x0, x1] = parseRange(attr(wordTag, "x") ?? "");
    const [y0, y1] = parseRange(attr(wordTag, "y") ?? "");
    words.set(id, { x0, x1, y0, y1, direction: x0 !== x1 ? "across" : "down" });
  }

  const readAnswer = (w: WordSpan): string => {
    let out = "";
    if (w.direction === "across") {
      for (let x = w.x0; x <= w.x1; x++) out += grid[w.y0 - 1][x - 1].solution ?? "";
    } else {
      for (let y = w.y0; y <= w.y1; y++) out += grid[y - 1][w.x0 - 1].solution ?? "";
    }
    return out;
  };

  const across: Clue[] = [];
  const down: Clue[] = [];
  for (const cluesBlock of xml.match(/<clues[^>]*>[\s\S]*?<\/clues>/g) ?? []) {
    const isAcross = /<title>\s*<b>Across<\/b>/i.test(cluesBlock);
    for (const clueTag of cluesBlock.match(/<clue[^>]*>[^<]*<\/clue>/g) ?? []) {
      const wid = attr(clueTag, "word");
      const w = wid ? words.get(wid) : undefined;
      if (!w) continue;
      const format = attr(clueTag, "format");
      const text = decodeEntities(
        clueTag.replace(/^<clue[^>]*>/, "").replace(/<\/clue>$/, ""),
      );
      const clue: Clue = {
        number: Number(attr(clueTag, "number")),
        clue: text,
        answer: readAnswer(w),
        row: w.y0 - 1,
        col: w.x0 - 1,
        len: w.direction === "across" ? w.x1 - w.x0 + 1 : w.y1 - w.y0 + 1,
        ...(format ? { enumeration: format } : {}),
      };
      (isAcross ? across : down).push(clue);
    }
  }
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);

  const iso = isoFromYymmdd(date);
  return {
    source,
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title: SOURCES[source].label,
    author,
    editor: "",
    width,
    height,
    grid,
    clues: { across, down },
  };
}
