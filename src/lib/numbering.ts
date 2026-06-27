import type { Cell, Direction } from "../types.ts";

export interface WordStart {
  number: number;
  row: number;
  col: number;
  direction: Direction;
  len: number;
}

const isOpen = (grid: Cell[][], r: number, c: number): boolean =>
  r >= 0 &&
  c >= 0 &&
  r < grid.length &&
  c < grid[r].length &&
  !grid[r][c].black;

/**
 * Walk the grid in reading order and assign standard crossword numbers.
 * Mutates each cell's `number` and returns the list of word starts (with
 * their lengths) in numbering order — across and down interleaved.
 *
 * A non-black cell starts an Across word when its left neighbour is missing
 * or black AND its right neighbour is open; analogously for Down (above/below).
 */
export function numberGrid(grid: Cell[][]): WordStart[] {
  const starts: WordStart[] = [];
  let n = 0;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const cell = grid[r][c];
      if (cell.black) continue;

      const startsAcross = !isOpen(grid, r, c - 1) && isOpen(grid, r, c + 1);
      const startsDown = !isOpen(grid, r - 1, c) && isOpen(grid, r + 1, c);
      if (!startsAcross && !startsDown) continue;

      cell.number = ++n;

      if (startsAcross) {
        let len = 0;
        while (isOpen(grid, r, c + len)) len++;
        starts.push({ number: n, row: r, col: c, direction: "across", len });
      }
      if (startsDown) {
        let len = 0;
        while (isOpen(grid, r + len, c)) len++;
        starts.push({ number: n, row: r, col: c, direction: "down", len });
      }
    }
  }

  return starts;
}

/** Read the solution letters of a word given its start, direction and length. */
export function readWord(
  grid: Cell[][],
  start: { row: number; col: number; len: number; direction: Direction },
): string {
  let word = "";
  for (let i = 0; i < start.len; i++) {
    const r = start.direction === "down" ? start.row + i : start.row;
    const c = start.direction === "across" ? start.col + i : start.col;
    word += grid[r][c].solution ?? "";
  }
  return word;
}
