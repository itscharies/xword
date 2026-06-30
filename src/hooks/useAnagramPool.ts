import { useCallback, useEffect, useRef, useState } from "react";

export interface AnagramTile {
  /** Stable identity so a tile keeps its DOM node across reorders/repeats. */
  id: number;
  ch: string;
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

  const shuffle = useCallback(
    () =>
      setTiles((t) => {
        const a = [...t];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }),
    [],
  );

  const reorder = useCallback((next: AnagramTile[]) => setTiles(next), []);

  return { tiles, view, setView, add, backspace, shuffle, reorder };
}
