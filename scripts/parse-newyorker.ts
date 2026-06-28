import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";
import { SOURCES } from "../src/lib/sources.ts";
import { numberGrid, type WordStart } from "../src/lib/numbering.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoFromYmd(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Body of a `## <name>` section in the New Yorker's markdown puzzle format. */
function section(data: string, name: string): string {
  const re = new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?:\\n##\\s|$)`, "i");
  return data.match(re)?.[1]?.trim() ?? "";
}

/**
 * Parse the New Yorker's markdown crossword payload (from the Condé puzzles
 * API) into our Puzzle shape. Format:
 *
 *   ## Grid        rows of letters, "." = black square
 *   ## Clues       "A1. <clue> ~ <ANSWER>" / "D1. <clue> ~ <ANSWER>"
 *
 * Clue labels (A1, D6, …) follow standard grid numbering, so numberGrid()
 * reproduces them and we map each clue to its start cell.
 */
export function parseNewYorker(
  data: string,
  source: PuzzleSource,
  date: string,
): Puzzle {
  const metaText = section(data, "Metadata");
  // [ \t]* (not \s*) so an empty value doesn't swallow the next line.
  const meta = (k: string) =>
    metaText.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "mi"))?.[1]?.trim() ?? "";

  const rows = section(data, "Grid")
    .split(/\r?\n/)
    .filter((l) => l.length);
  if (!rows.length) throw new Error(`${date}: empty grid`);
  const width = Math.max(...rows.map((r) => r.length));
  const grid: Cell[][] = rows.map((line) => {
    const row: Cell[] = [];
    for (let c = 0; c < width; c++) {
      const ch = line[c] ?? ".";
      row.push(ch === "." || ch === " " ? { black: true } : { solution: ch.toUpperCase() });
    }
    return row;
  });
  const height = grid.length;

  const starts = numberGrid(grid);
  const byLabel = new Map<string, WordStart>();
  for (const s of starts) byLabel.set(`${s.direction[0]}${s.number}`, s);

  const across: Clue[] = [];
  const down: Clue[] = [];
  for (const line of section(data, "Clues").split(/\r?\n/)) {
    const m = line.match(/^([AD])(\d+)\.\s*(.*?)\s*~\s*(.+)$/);
    if (!m) continue;
    const [, dir, num, clue, answer] = m;
    const start = byLabel.get(`${dir === "A" ? "a" : "d"}${num}`);
    if (!start) continue;
    const c: Clue = {
      number: Number(num),
      clue: clue.trim(),
      answer: answer.trim().toUpperCase(),
      row: start.row,
      col: start.col,
      len: start.len,
    };
    (dir === "A" ? across : down).push(c);
  }
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);

  const iso = isoFromYmd(date);
  return {
    source,
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title: SOURCES[source].label,
    author: meta("author"),
    editor: meta("editor"),
    width,
    height,
    grid,
    clues: { across, down },
  };
}
