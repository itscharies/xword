import type { AnagramTile } from "../hooks/useAnagramPool.ts";

/** Fisher-Yates over the unlocked tiles only — locked ones stay in their slot
 * while the rest of the pool reshuffles around them. */
export function shuffleTiles(tiles: AnagramTile[]): AnagramTile[] {
  const next = [...tiles];
  const openIndices = next.flatMap((t, i) => (t.locked ? [] : [i]));
  for (let i = openIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = openIndices[i];
    const b = openIndices[j];
    [next[a], next[b]] = [next[b], next[a]];
  }
  return next;
}
