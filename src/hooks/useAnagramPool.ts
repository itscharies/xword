import { useCallback, useEffect, useState } from "react";

export interface AnagramPool {
  letters: string[];
  view: "circle" | "grid";
  setView: (v: "circle" | "grid") => void;
  add: (ch: string) => void;
  backspace: () => void;
  shuffle: () => void;
}

/**
 * A scratch pool of letters for the simplified mobile anagram overlay: you type
 * letters in (from the on-screen keyboard) and shuffle / lay them out in a
 * circle or grid. Starts empty each time the overlay opens.
 */
export function useAnagramPool(open: boolean): AnagramPool {
  const [letters, setLetters] = useState<string[]>([]);
  const [view, setView] = useState<"circle" | "grid">("circle");

  useEffect(() => {
    if (open) setLetters([]);
  }, [open]);

  const add = useCallback((ch: string) => {
    const c = ch.toUpperCase();
    if (/^[A-Z]$/.test(c)) setLetters((l) => [...l, c]);
  }, []);

  const backspace = useCallback(() => setLetters((l) => l.slice(0, -1)), []);

  const shuffle = useCallback(
    () =>
      setLetters((l) => {
        const a = [...l];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }),
    [],
  );

  return { letters, view, setView, add, backspace, shuffle };
}
