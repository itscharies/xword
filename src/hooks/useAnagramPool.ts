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
  /** Move the tile at `from` to index `to` (drag-to-reorder). */
  move: (from: number, to: number) => void;
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

  const move = useCallback(
    (from: number, to: number) =>
      setTiles((t) => {
        if (
          from === to ||
          from < 0 ||
          to < 0 ||
          from >= t.length ||
          to >= t.length
        )
          return t;
        const a = [...t];
        const [x] = a.splice(from, 1);
        a.splice(to, 0, x);
        return a;
      }),
    [],
  );

  return { tiles, view, setView, add, backspace, shuffle, move };
}
