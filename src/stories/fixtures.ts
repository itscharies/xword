// Shared fixtures for Ladle stories. Puzzles are built from string rows and
// run through the real numbering pass, so clue numbers, lengths, and answers
// always agree with the grid — the same invariants the app relies on.

import type { Cell, Clue, Direction, Puzzle } from "../types.ts";
import type { Progress } from "../lib/storage.ts";
import type { RemoteCursor } from "../hooks/useSession.ts";
import { numberGrid, readWord, type WordStart } from "../lib/numbering.ts";

/** Build a Puzzle from rows of solution letters; `#` is a black square. */
export function makePuzzle(rows: string[], overrides: Partial<Puzzle> = {}): Puzzle {
  const grid: Cell[][] = rows.map((row) =>
    row.split("").map((ch): Cell => (ch === "#" ? { black: true } : { solution: ch })),
  );
  const starts = numberGrid(grid);
  const toClue = (s: WordStart): Clue => ({
    number: s.number,
    clue: `Placeholder clue for ${readWord(grid, s)}`,
    answer: readWord(grid, s),
    row: s.row,
    col: s.col,
    len: s.len,
  });
  return {
    date: "260101",
    isoDate: "2026-01-01",
    weekday: "Thu",
    title: "Fixture mini",
    author: "The Gallery",
    editor: "Ladle",
    width: rows[0].length,
    height: rows.length,
    grid,
    clues: {
      across: starts.filter((s) => s.direction === "across").map(toClue),
      down: starts.filter((s) => s.direction === "down").map(toClue),
    },
    ...overrides,
  };
}

const MINI_ROWS = ["#CAB#", "SOLVE", "ARENA", "GRIDS", "#AXE#"];

/** A clean 5×5 mini for interaction and cursor stories. */
export const MINI = makePuzzle(MINI_ROWS);

/** The same mini flagged cryptic: clues gain enumerations, and the solver
 *  chrome offers the anagram helper. */
export const CRYPTIC_MINI = makePuzzle(MINI_ROWS, {
  title: "Cryptic fixture",
  cryptic: true,
});

/** A 40×40 monster so the pan/zoom canvas has something to actually pan.
 *  Deterministic lattice of blocked squares (~1 in 11) and arbitrary letters
 *  — the layout only needs to look crossword-shaped, not solve like one. */
export const GIANT = (() => {
  const size = 40;
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let row = "";
    for (let c = 0; c < size; c++) {
      row +=
        (r * 7 + c * 3) % 11 === 0
          ? "#"
          : String.fromCharCode(65 + ((r * 13 + c * 7) % 26));
    }
    rows.push(row);
  }
  return makePuzzle(rows, { title: "Giant fixture" });
})();

/** The same mini wearing every grid decoration at once: circles, shading,
 *  and word-separator bars. */
export const KITCHEN_SINK: Puzzle = (() => {
  const p = makePuzzle(MINI_ROWS, { title: "Kitchen sink" });
  const circled: Array<[number, number]> = [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]];
  for (const [r, c] of circled) p.grid[r][c].circled = true;
  for (const r of [1, 2, 3]) p.grid[r][4].shaded = true;
  p.grid[1][1].barRight = true;
  p.grid[3][2].barBottom = true;
  return p;
})();

/** Seeded solve state for mark rendering: one revealed cell ("1,0"), a wrong
 *  letter at (3,0), and a too-long rebus entry at (1,3) that renders with the
 *  shrunken `.multi` letter styling. Run `xw.check("puzzle")` to flag the
 *  incorrect ones. */
export const SINK_PROGRESS: Progress = {
  entries: [
    ["", "", "", "", ""],
    ["S", "", "", "VER", ""],
    ["A", "R", "E", "N", "A"],
    ["Z", "", "", "", ""],
    ["", "", "", "", ""],
  ],
  revealed: ["1,0"],
  elapsed: 0,
  completed: false,
};

export const mkPeer = (
  username: string,
  displayName: string,
  color: string,
  row: number,
  col: number,
  direction: Direction,
): RemoteCursor => ({
  sid: `sid-${username}`,
  userId: `user-${username}`,
  username,
  displayName,
  color,
  letter: displayName.charAt(0).toUpperCase(),
  row,
  col,
  direction,
});

/** Fixture co-op peers, spread across MINI. The first three sit on the same
 *  cell (2,2) to exercise ring/badge stacking and its cap of two. */
export const PEERS = {
  /** On (2,1), solving 5-across (ARENA). */
  ada: mkPeer("ada", "Ada", "#ff2d8e", 2, 1, "across"),
  /** On (2,2), solving 3-down. */
  grace: mkPeer("grace", "Grace", "#3b82ff", 2, 2, "down"),
  /** Also on (2,2), solving 5-across — stacks with Grace. */
  alan: mkPeer("alan", "Alan", "#22c55e", 2, 2, "across"),
  /** Also on (2,2) — third in the stack. */
  edie: mkPeer("edie", "Edie", "#ff7a00", 2, 2, "down"),
  /** Also on (2,2) — fourth in the stack, the last that renders. */
  kay: mkPeer("kay", "Kay", "#cf5cff", 2, 2, "across"),
  /** On (0,2), solving 2-down — crosses Ada's word at (2,2). */
  ivy: mkPeer("ivy", "Ivy", "#8a5cff", 0, 2, "down"),
  /** On (4,1), solving the bottom row (AXE). */
  max: mkPeer("max", "Max", "#00e5ff", 4, 1, "across"),
};

/** Peers as an ordered pool for "crowd size" controls. */
export const PEER_POOL: RemoteCursor[] = [
  PEERS.ada,
  PEERS.grace,
  PEERS.alan,
  PEERS.edie,
  PEERS.kay,
  PEERS.ivy,
  PEERS.max,
];

/** Peers spread across GIANT's open cells, so the pan/zoom canvas and its
 *  minimap have players scattered beyond the local viewport. */
export const GIANT_PEERS: RemoteCursor[] = [
  mkPeer("ada", "Ada", "#ff2d8e", 2, 1, "across"),
  mkPeer("grace", "Grace", "#3b82ff", 10, 30, "down"),
  mkPeer("alan", "Alan", "#22c55e", 25, 5, "across"),
  mkPeer("edie", "Edie", "#ff7a00", 35, 35, "down"),
  mkPeer("ivy", "Ivy", "#8a5cff", 5, 20, "across"),
];

/** Co-op session roster matching the peer fixtures. */
export const PARTICIPANTS = ["ada", "grace", "alan", "edie"].map((name) => ({
  user_id: `user-${name}`,
  username: name,
  display_name: name.charAt(0).toUpperCase() + name.slice(1),
  joined_at: "2026-01-01T09:00:00Z",
}));

/** Followed-solver progress rows for the solves flyout. */
export const MUTUALS = [
  { name: "ada", accent: "cyan" as const, completed: true, filled: 21, total: 21 },
  { name: "grace", accent: "pink" as const, completed: false, filled: 14, total: 21 },
  { name: "alan", accent: "lime" as const, completed: false, filled: 3, total: 21 },
].map(({ name, accent, completed, filled, total }) => ({
  user_id: `user-${name}`,
  username: name,
  display_name: name.charAt(0).toUpperCase() + name.slice(1),
  accent,
  completed,
  filled,
  total,
  updated_at: "2026-01-01T10:30:00Z",
}));
