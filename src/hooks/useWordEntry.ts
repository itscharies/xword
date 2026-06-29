import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Crossword, Pos } from "./useCrossword.ts";

export interface WordEntry {
  /** Cells of the active word, in order. */
  positions: Pos[];
  /** Per-cell: true if it was already filled when the overlay opened (locked). */
  locked: boolean[];
  /** Current grid letters, aligned to `positions`. */
  letters: string[];
  /** Index of the editable cell the next keystroke lands in. */
  cursor: number;
  type: (ch: string) => void;
  backspace: () => void;
  select: (i: number) => void;
}

/**
 * A crossword-style entry for the active word, used by the mobile anagram
 * overlay. Letters already in the grid are locked in their spots; the blanks
 * are filled (via the on-screen keyboard) and written straight back into the
 * grid. The cursor only ever lands on the editable (blank-at-open) cells.
 */
export function useWordEntry(xw: Crossword, open: boolean): WordEntry {
  const clue = xw.activeClue;

  const positions = useMemo<Pos[]>(() => {
    if (!clue) return [];
    return Array.from({ length: clue.len }, (_, i) => ({
      row: clue.direction === "down" ? clue.row + i : clue.row,
      col: clue.direction === "across" ? clue.col + i : clue.col,
    }));
  }, [clue]);

  const [locked, setLocked] = useState<boolean[]>([]);
  const [cursor, setCursorState] = useState(0);
  const cursorRef = useRef(0);
  const lockedRef = useRef<boolean[]>([]);
  const posRef = useRef<Pos[]>([]);
  posRef.current = positions;
  const setCursor = (i: number) => {
    cursorRef.current = i;
    setCursorState(i);
  };

  // Capture which cells are pre-filled (locked) when the overlay opens, and
  // park the cursor on the first blank.
  useEffect(() => {
    if (!open) return;
    const lk = positions.map((p) => !!xw.cellEntry(p.row, p.col));
    lockedRef.current = lk;
    setLocked(lk);
    const first = lk.findIndex((v) => !v);
    setCursor(first === -1 ? 0 : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const type = useCallback(
    (ch: string) => {
      const pos = posRef.current;
      const lk = lockedRef.current;
      let i = cursorRef.current;
      if (i < 0 || i >= pos.length || lk[i]) {
        i = pos.findIndex((_, j) => !lk[j]);
        if (i === -1) return;
      }
      const p = pos[i];
      xw.setCell(p.row, p.col, ch);
      let n = i + 1;
      while (n < pos.length && lk[n]) n++;
      setCursor(n < pos.length ? n : i);
    },
    [xw],
  );

  const backspace = useCallback(() => {
    const pos = posRef.current;
    const lk = lockedRef.current;
    const cur = cursorRef.current;
    const here = pos[cur];
    if (here && !lk[cur] && xw.cellEntry(here.row, here.col)) {
      xw.setCell(here.row, here.col, "");
      return;
    }
    let i = cur - 1;
    while (i >= 0 && lk[i]) i--;
    if (i >= 0) {
      const p = pos[i];
      xw.setCell(p.row, p.col, "");
      setCursor(i);
    }
  }, [xw]);

  const select = useCallback((i: number) => {
    if (!lockedRef.current[i]) setCursor(i);
  }, []);

  const letters = positions.map((p) => xw.entries[p.row][p.col]);

  return { positions, locked, letters, cursor, type, backspace, select };
}
