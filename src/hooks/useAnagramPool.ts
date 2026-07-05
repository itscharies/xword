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

/** Snapshot of the desktop anagram helper's working state for a single clue. */
export interface AnagramClueState {
  pool: string;
  tiles: AnagramTile[];
  view: "circle" | "grid";
  answer: string;
}

/**
 * Holds each clue's anagram-helper progress in a plain ref (not React state),
 * keyed by clue, so closing and reopening the helper — which unmounts it —
 * doesn't lose whatever letters/tiles/answer were in progress. A ref is
 * enough since the store only needs to survive across mounts, not drive
 * re-renders itself.
 */
export interface AnagramHelperStore {
  get: (key: string) => AnagramClueState | undefined;
  set: (key: string, state: AnagramClueState) => void;
}

export function useAnagramHelperStore(): AnagramHelperStore {
  const ref = useRef(new Map<string, AnagramClueState>());
  const get = useCallback((key: string) => ref.current.get(key), []);
  const set = useCallback((key: string, state: AnagramClueState) => {
    ref.current.set(key, state);
  }, []);
  return { get, set };
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
