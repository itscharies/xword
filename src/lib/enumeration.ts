// Cryptic (and Guardian quick) clues carry a word-length enumeration in
// parentheses at the end of the clue text, e.g. "… almost? (4,5)". We store
// that as a separate `enumeration` field rather than baked into the clue
// string, and re-render it after the clue.

import type { Puzzle } from "../types.ts";

// A trailing parenthetical made up only of enumeration characters and starting
// with a digit — so it matches "(4,5)", "(7)", "(4-3)", "(3,2,4)" but not a
// cross-reference like "(see 1)" or any clue that just happens to end in prose.
const ENUM_RE = /\s*\(([0-9][0-9,\-–.\s']*)\)\s*$/;

/** Split a clue into its text and trailing enumeration (sans parentheses).
 * Returns the clue unchanged with no enumeration when there's no match. */
export function splitEnumeration(clue: string): {
  clue: string;
  enumeration?: string;
} {
  const m = clue.match(ENUM_RE);
  if (m?.index === undefined) return { clue };
  return { clue: clue.slice(0, m.index).trimEnd(), enumeration: m[1].trim() };
}

/** Mark word-separator bars (Cell.barRight/barBottom) on a puzzle's grid,
 * derived from each clue's enumeration — "4,5" bars the 4th cell's trailing
 * edge, "3-2-3" the 3rd and 5th. The Guardian ships explicit separator data
 * that the parser bakes into the grid; deriving from the enumeration at load
 * time gives every enumerated source (e.g. the Independent's minis and
 * cryptics) the same look, including puzzles stored before this existed.
 * Idempotent, and skips any clue whose enumeration doesn't add up to its
 * length (so a source's bad data can't misplace a bar). */
export function applyEnumerationBars(puzzle: Puzzle): void {
  for (const direction of ["across", "down"] as const) {
    for (const clue of puzzle.clues[direction]) {
      const lens = clue.enumeration?.match(/\d+/g)?.map(Number) ?? [];
      if (lens.length < 2) continue;
      if (lens.reduce((a, b) => a + b, 0) !== clue.len) continue;
      let pos = 0;
      for (const n of lens.slice(0, -1)) {
        pos += n;
        const r = direction === "down" ? clue.row + pos - 1 : clue.row;
        const c = direction === "across" ? clue.col + pos - 1 : clue.col;
        const cell = puzzle.grid[r]?.[c];
        if (!cell || cell.black) continue;
        if (direction === "across") cell.barRight = true;
        else cell.barBottom = true;
      }
    }
  }
}
