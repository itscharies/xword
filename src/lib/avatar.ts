// A deterministic, crossword-styled "avatar" generated purely from a
// person's username + display name — there's no photo to store or fetch,
// since we only ever have a real one (from Google OAuth) for whoever is
// actually signed in right now, never for someone else's profile.

import { ACCENTS } from "./theme.ts";

export const AVATAR_GRID = 3;
export const AVATAR_CENTER = 1;
const CENTER = AVATAR_CENTER;

/** Deterministic 32-bit FNV-1a hash — the same username always produces the
 *  same avatar, and different usernames essentially never collide. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A tiny seeded PRNG (mulberry32) so the whole avatar reproduces from one
 *  hash — no Math.random anywhere. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AvatarPattern {
  /** [row][col] — true is an open, letter-tile-style cell; false is a black square. */
  open: boolean[][];
  /** The row or column (always the one through the center — see below) to
   *  render as a lighter tint of `accent`, instead of the plain open-cell
   *  colour. */
  highlight: { axis: "row" | "col"; index: number };
  accent: (typeof ACCENTS)[number];
  letter: string;
}

/** A random-looking (but reproducible) crossword block pattern, seeded from
 *  `username` — built with 180°-rotational symmetry, the same layout rule
 *  real crosswords use. The center cell always holds the first letter of
 *  `displayName` and is never boxed in on all four sides by black squares. */
export function computeAvatarPattern(username: string, displayName: string): AvatarPattern {
  const rand = mulberry32(hashString(username));
  const n = AVATAR_GRID;
  const open: boolean[][] = Array.from({ length: n }, () => Array(n).fill(true));

  const BLACK_CHANCE = 0.4;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const mr = n - 1 - r;
      const mc = n - 1 - c;
      // Decide once per symmetric pair, then fill both ends together.
      if (r > mr || (r === mr && c > mc)) continue;
      const black = rand() < BLACK_CHANCE;
      open[r][c] = !black;
      open[mr][mc] = !black;
    }
  }

  // The center is always a letter tile, and always reachable — never fully
  // enclosed by black squares on every side.
  open[CENTER][CENTER] = true;
  const neighbors: [number, number][] = [
    [CENTER - 1, CENTER],
    [CENTER + 1, CENTER],
    [CENTER, CENTER - 1],
    [CENTER, CENTER + 1],
  ];
  if (neighbors.every(([r, c]) => !open[r][c])) {
    const [r, c] = neighbors[Math.floor(rand() * neighbors.length)];
    open[r][c] = true;
    open[n - 1 - r][n - 1 - c] = true;
  }

  // The highlighted line always runs through the center tile — a random row
  // or column elsewhere wouldn't visually read as "belonging" to it.
  const axis = rand() < 0.5 ? "row" : "col";
  const accent = ACCENTS[Math.floor(rand() * ACCENTS.length)];
  const letter = (displayName.trim()[0] ?? username[0] ?? "?").toUpperCase();

  return { open, highlight: { axis, index: CENTER }, accent, letter };
}
