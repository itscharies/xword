import type { Cell, Clue, Puzzle } from "../src/types.ts";
import { numberGrid, readWord } from "../src/lib/numbering.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Convert a YYMMDD source date into an ISO date string (assumes 20YY). */
export function dateToIso(date: string): string {
  const yy = date.slice(0, 2);
  const mm = date.slice(2, 4);
  const dd = date.slice(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

function weekdayFromIso(iso: string): string {
  // Parse as UTC to avoid timezone drift on the weekday.
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[dow];
}

/** Try to read the title from the puzzle payload, else synthesize one. */
function titleFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `NY Times, ${weekdayFromIso(iso)}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Parse the raw pzzl.com text payload for a single date into a Puzzle.
 *
 * Layout (after dropping the leading ARCHIVE marker + id):
 *   title / "author / editor" / width / height / #across / #down
 *   then `height` grid rows, then #across clues, then #down clues.
 */
export function parsePuzzle(raw: string, date: string): Puzzle {
  const lines = raw.split(/\r?\n/);

  // Header fields are the non-empty lines; the grid rows and clues that follow
  // are never empty, so filtering blanks is safe and tolerates the blank-line
  // separators the source sprinkles between header fields.
  const tokens = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  let i = 0;
  // Drop the ARCHIVE marker and the edition id that follow it.
  if (tokens[i] === "ARCHIVE") i++;
  if (/^\d+$/.test(tokens[i])) i++; // edition id

  const title = tokens[i++] ?? titleFromIso(dateToIso(date));
  const byline = tokens[i++] ?? "";
  const [author = "", editor = ""] = byline.split(" / ").map((s) => s.trim());

  const width = Number(tokens[i++]);
  const height = Number(tokens[i++]);
  const acrossCount = Number(tokens[i++]);
  const downCount = Number(tokens[i++]);

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Bad dimensions for ${date}: ${width}x${height}`);
  }

  // Grid rows. Special characters in the source:
  //   '#' black square, '.' void cell (outside the puzzle),
  //   '^' shaded (greyed) cell, '%' circled cell — both prefix the next letter,
  //   ',' rebus join — connects the surrounding letters into one multi-letter
  //       cell, e.g. "ICEB,L,O,C,KERS" -> [ICE][BLOCK][ERS].
  const grid: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    const rowText = tokens[i++] ?? "";
    const row: Cell[] = [];
    let shadedNext = false;
    let circledNext = false;
    let mergeNext = false; // a ',' was seen — fold the next letter into the last cell
    for (const ch of rowText) {
      if (ch === "^") {
        shadedNext = true;
        continue;
      }
      if (ch === "%") {
        circledNext = true;
        continue;
      }
      if (ch === ",") {
        mergeNext = true;
        continue;
      }
      if (ch === "#") {
        row.push({ black: true });
      } else if (ch === ".") {
        row.push({ black: true, void: true });
      } else if (mergeNext && row.length && !row[row.length - 1].black) {
        // Append to the previous (non-black) cell to form a rebus.
        const prev = row[row.length - 1];
        prev.solution = (prev.solution ?? "") + ch.toUpperCase();
        prev.rebus = true;
        if (shadedNext) prev.shaded = true;
        if (circledNext) prev.circled = true;
      } else {
        const cell: Cell = { solution: ch.toUpperCase() };
        if (shadedNext) cell.shaded = true;
        if (circledNext) cell.circled = true;
        row.push(cell);
      }
      shadedNext = false;
      circledNext = false;
      mergeNext = false;
    }
    // Pad short rows / trim long ones to exactly `width`.
    while (row.length < width) row.push({ black: true });
    row.length = width;
    grid.push(row);
  }

  // Some payloads (notably oversized/Sunday grids) pad the real puzzle into a
  // larger bounding box with '.' void filler on the edges. Trim any fully-void
  // border row or column so the visible grid is tight — interior voids (genuine
  // holes in a non-rectangular puzzle) are left untouched.
  const rowAllVoid = (row: Cell[]) => row.every((c) => c.void);
  const colAllVoid = (c: number) => grid.every((row) => row[c]?.void);
  while (grid.length > 1 && rowAllVoid(grid[0])) grid.shift();
  while (grid.length > 1 && rowAllVoid(grid[grid.length - 1])) grid.pop();
  while (grid[0].length > 1 && colAllVoid(0)) grid.forEach((row) => row.shift());
  while (grid[0].length > 1 && colAllVoid(grid[0].length - 1)) {
    grid.forEach((row) => row.pop());
  }
  const gridHeight = grid.length;
  const gridWidth = grid[0].length;

  // Clues follow, across then down, each list in clue-number order.
  const acrossClueText = tokens.slice(i, i + acrossCount);
  i += acrossCount;
  const downClueText = tokens.slice(i, i + downCount);
  i += downCount;

  // Number the grid and split starts into across/down (numbering order).
  const starts = numberGrid(grid);
  const acrossStarts = starts.filter((s) => s.direction === "across");
  const downStarts = starts.filter((s) => s.direction === "down");

  if (acrossStarts.length !== acrossCount) {
    throw new Error(
      `${date}: across starts ${acrossStarts.length} != declared ${acrossCount}`,
    );
  }
  if (downStarts.length !== downCount) {
    throw new Error(
      `${date}: down starts ${downStarts.length} != declared ${downCount}`,
    );
  }

  const toClue = (
    start: (typeof starts)[number],
    text: string | undefined,
  ): Clue => ({
    number: start.number,
    clue: text ?? "",
    answer: readWord(grid, start),
    row: start.row,
    col: start.col,
    len: start.len,
  });

  const across = acrossStarts.map((s, idx) => toClue(s, acrossClueText[idx]));
  const down = downStarts.map((s, idx) => toClue(s, downClueText[idx]));

  const iso = dateToIso(date);
  return {
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title,
    author,
    editor,
    width: gridWidth,
    height: gridHeight,
    grid,
    clues: { across, down },
  };
}
