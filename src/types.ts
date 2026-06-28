// Shared types used by both the fetch/parse scripts and the React app.

import type { PuzzleSource } from "./lib/sources.ts";

export type Direction = "across" | "down";

/** A single grid cell. Black squares have `black: true` and no solution. */
export interface Cell {
  black?: boolean;
  /** A void cell ('.' in the source): outside the puzzle, rendered blank. */
  void?: boolean;
  /** Uppercase solution letter for non-black cells. */
  solution?: string;
  /** Clue number shown in the corner, if this cell starts a word. */
  number?: number;
  /** Cell carries a circle (themed-puzzle marker, '^' in the source). */
  circled?: boolean;
  /** Cell is shaded (themed-puzzle marker, '%' in the source). */
  shaded?: boolean;
  /** Cell holds more than one letter (a rebus); `solution` is the full string. */
  rebus?: boolean;
}

/** A clue + its answer and starting position on the grid. */
export interface Clue {
  number: number;
  clue: string;
  answer: string;
  row: number;
  col: number;
  len: number;
}

/** A fully parsed puzzle, as stored in public/puzzles/<source>/<date>.json. */
export interface Puzzle {
  /** Which collection this came from. */
  source: PuzzleSource;
  /** Source-native id: YYMMDD for nyt, YYYYMMDD for the Seattle Times sets. */
  date: string;
  /** ISO date, e.g. "2026-06-27". */
  isoDate: string;
  /** Short weekday, e.g. "Sat". */
  weekday: string;
  title: string;
  author: string;
  editor: string;
  width: number;
  height: number;
  grid: Cell[][];
  clues: {
    across: Clue[];
    down: Clue[];
  };
}

/** One entry in public/puzzles/index.json. */
export interface PuzzleIndexEntry {
  source: PuzzleSource;
  date: string;
  isoDate: string;
  weekday: string;
  title: string;
  author: string;
}
