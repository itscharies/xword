import { useCallback, useEffect, useRef, useState } from "react";
import { shuffleTiles } from "../lib/anagram.ts";

export interface AnagramTile {
  /** Stable identity so a tile keeps its DOM node across reorders/repeats. */
  id: number;
  ch: string;
  /** Locked tiles (double-tap/click to toggle) stay put on shuffle and can't
   * be dragged to a new slot. */
  locked?: boolean;
}

export interface AnagramPool {
  tiles: AnagramTile[];
  view: "circle" | "grid";
  setView: (v: "circle" | "grid") => void;
  add: (ch: string) => void;
  backspace: () => void;
  shuffle: () => void;
  /** Replace the tile order wholesale (drag-to-reorder). */
  reorder: (tiles: AnagramTile[]) => void;
  toggleLock: (id: number) => void;
}

/**
 * A scratch pool of letters for the simplified mobile anagram overlay: you type
 * letters in (from the on-screen keyboard), shuffle them, drag to reorder, and
 * lay them out in a circle or grid. Starts empty each time the overlay opens.
 */
export function useAnagramPool(open: boolean): AnagramPool {
  const [tiles, setTiles] = useState<AnagramTile[]>([]);
  const [view, setView] = useState<"circle" | "grid">("circle");
  const idRef = useRef(0);

  useEffect(() => {
    if (open) setTiles([]);
  }, [open]);

  const add = useCallback((ch: string) => {
    const c = ch.toUpperCase();
    if (/^[A-Z]$/.test(c))
      setTiles((t) => [...t, { id: idRef.current++, ch: c }]);
  }, []);

  const backspace = useCallback(() => setTiles((t) => t.slice(0, -1)), []);

  const shuffle = useCallback(() => setTiles(shuffleTiles), []);

  const reorder = useCallback((next: AnagramTile[]) => setTiles(next), []);

  const toggleLock = useCallback(
    (id: number) =>
      setTiles((t) => t.map((tile) => (tile.id === id ? { ...tile, locked: !tile.locked } : tile))),
    [],
  );

  return { tiles, view, setView, add, backspace, shuffle, reorder, toggleLock };
}
