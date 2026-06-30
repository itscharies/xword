import { useCallback, useMemo, useRef, useState } from "react";
import type { Clue, Direction, Puzzle } from "../types.ts";
import type { Progress } from "../lib/storage.ts";
import { parseClueRefs } from "../lib/clueRefs.ts";
import { getAutoAdvance } from "../lib/theme.ts";
import { SOURCES } from "../lib/sources.ts";

export type RevealScope = "cell" | "word" | "puzzle";

export interface Pos {
  row: number;
  col: number;
}

const keyOf = (r: number, c: number) => `${r},${c}`;
const otherDir = (d: Direction): Direction =>
  d === "across" ? "down" : "across";

// Clue carries its direction once we attach it in the lookup.
type DirClue = Clue & { direction: Direction };

/** Cells covered by a clue, in order from its start. */
function clueCells(clue: DirClue): Pos[] {
  const cells: Pos[] = [];
  for (let i = 0; i < clue.len; i++) {
    cells.push({
      row: clue.direction === "down" ? clue.row + i : clue.row,
      col: clue.direction === "across" ? clue.col + i : clue.col,
    });
  }
  return cells;
}

/**
 * Crossword solving engine. Refs are the source of truth for the mutable
 * solve state (entries / cursor / direction / marks) so that a synchronous
 * burst of key events — fast typing, held keys, automated input — all read
 * the up-to-date value instead of a stale render closure. React state mirrors
 * the refs purely to trigger re-renders.
 */
export function useCrossword(puzzle: Puzzle, saved: Progress | null) {
  const { grid, width, height, clues } = puzzle;

  // (row,col) -> the across/down clue covering it.
  const lookup = useMemo(() => {
    const map = new Map<string, { across?: DirClue; down?: DirClue }>();
    const add = (clue: Clue, direction: Direction) => {
      const dc: DirClue = { ...clue, direction };
      for (const { row, col } of clueCells(dc)) {
        const k = keyOf(row, col);
        const entry = map.get(k) ?? {};
        entry[direction] = dc;
        map.set(k, entry);
      }
    };
    clues.across.forEach((c) => add(c, "across"));
    clues.down.forEach((c) => add(c, "down"));
    return map;
  }, [clues]);

  // Flat clue order for Tab navigation: across list, then down list.
  const orderedClues = useMemo<DirClue[]>(
    () => [
      ...clues.across.map((c) => ({ ...c, direction: "across" as const })),
      ...clues.down.map((c) => ({ ...c, direction: "down" as const })),
    ],
    [clues],
  );

  // number+direction -> clue, for resolving cross-references in clue text.
  const byNumber = useMemo(() => {
    const map = new Map<string, DirClue>();
    for (const c of orderedClues) map.set(`${c.number}-${c.direction}`, c);
    return map;
  }, [orderedClues]);

  const isOpen = useCallback(
    (r: number, c: number) =>
      r >= 0 && c >= 0 && r < height && c < width && !grid[r][c].black,
    [grid, width, height],
  );

  const firstOpen = useMemo<Pos>(() => {
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++)
        if (!grid[r][c].black) return { row: r, col: c };
    return { row: 0, col: 0 };
  }, [grid, width, height]);

  // All non-black cells in reading order (for the clue-bar scrubber).
  const openCells = useMemo<Pos[]>(() => {
    const out: Pos[] = [];
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++)
        if (!grid[r][c].black) out.push({ row: r, col: c });
    return out;
  }, [grid, width, height]);

  // ---- state (mirrored by refs) ------------------------------------------

  const blank = () => grid.map((row) => row.map(() => ""));
  const [entries, setEntriesState] = useState<string[][]>(
    () => saved?.entries ?? blank(),
  );
  const [active, setActiveState] = useState<Pos>(firstOpen);
  const [direction, setDirectionState] = useState<Direction>("across");
  const [revealed, setRevealedState] = useState<Set<string>>(
    () => new Set(saved?.revealed ?? []),
  );
  const [wrong, setWrongState] = useState<Set<string>>(() => new Set());
  // Rebus mode: typed letters accumulate in the active cell instead of
  // advancing, so a whole word can be entered into one square.
  const [rebus, setRebusState] = useState(false);

  const entriesRef = useRef(entries);
  const activeRef = useRef(active);
  const directionRef = useRef(direction);
  const revealedRef = useRef(revealed);
  const wrongRef = useRef(wrong);
  const rebusRef = useRef(rebus);

  const setEntries = (g: string[][]) => {
    entriesRef.current = g;
    setEntriesState(g);
  };
  const setActive = (p: Pos) => {
    activeRef.current = p;
    setActiveState(p);
  };
  const setDirection = (d: Direction) => {
    directionRef.current = d;
    setDirectionState(d);
  };
  const setRevealed = (s: Set<string>) => {
    revealedRef.current = s;
    setRevealedState(s);
  };
  const setWrong = (s: Set<string>) => {
    wrongRef.current = s;
    setWrongState(s);
  };
  const setRebus = (v: boolean) => {
    rebusRef.current = v;
    setRebusState(v);
  };
  const toggleRebus = useCallback(() => setRebus(!rebusRef.current), []);

  // ---- derived helpers (operate on current refs) -------------------------

  const clueThrough = useCallback(
    (pos: Pos, dir: Direction): DirClue | undefined => {
      const here = lookup.get(keyOf(pos.row, pos.col));
      return here?.[dir] ?? here?.[otherDir(dir)];
    },
    [lookup],
  );

  const clueAt = useCallback(
    (r: number, c: number, dir: Direction): DirClue | undefined =>
      lookup.get(keyOf(r, c))?.[dir],
    [lookup],
  );

  const solutionAt = useCallback(
    (r: number, c: number): string => grid[r][c].solution ?? "",
    [grid],
  );

  // Active clue for rendering (derived from render state).
  const activeClue = useMemo<DirClue | undefined>(
    () => clueThrough(active, direction),
    [clueThrough, active, direction],
  );

  const highlighted = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    // Rebus mode targets a single square — don't light up the rest of the word,
    // so it's clear that only the active cell is being edited.
    if (rebus) return set;
    if (activeClue)
      for (const p of clueCells(activeClue)) set.add(keyOf(p.row, p.col));
    return set;
  }, [activeClue, rebus]);

  // "Starred" theme clues (text begins with "*"), e.g. the LA Times sets a
  // revealer pointing at "the answers to the starred clues".
  const starredClues = useMemo<DirClue[]>(
    () => orderedClues.filter((c) => c.clue.trim().startsWith("*")),
    [orderedClues],
  );

  // Clues cross-referenced by the active clue's text ("17-, 22- and 33-Across"),
  // plus — when the active clue is a revealer that mentions the starred clues —
  // every starred clue, so selecting the revealer lights up the theme answers.
  const linkedClues = useMemo<DirClue[]>(() => {
    if (!activeClue) return [];
    const refs = parseClueRefs(activeClue.clue, activeClue)
      .map((r) => byNumber.get(`${r.number}-${r.direction}`))
      .filter((c): c is DirClue => Boolean(c));
    if (/starred/i.test(activeClue.clue)) refs.push(...starredClues);
    return refs;
  }, [activeClue, byNumber, starredClues]);

  const linked = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (rebus) return set;
    for (const c of linkedClues)
      for (const p of clueCells(c)) set.add(keyOf(p.row, p.col));
    return set;
  }, [linkedClues, rebus]);

  // Quick lookup for clue lists: which numbers are linked, per direction.
  const linkedNumbers = useMemo(() => {
    const across = new Set<number>();
    const down = new Set<number>();
    for (const c of linkedClues)
      (c.direction === "across" ? across : down).add(c.number);
    return { across, down };
  }, [linkedClues]);

  // ---- navigation ---------------------------------------------------------

  const selectCell = useCallback(
    (r: number, c: number) => {
      if (!isOpen(r, c)) return;
      const cur = activeRef.current;
      if (cur.row === r && cur.col === c) {
        const here = lookup.get(keyOf(r, c));
        if (here?.across && here?.down) setDirection(otherDir(directionRef.current));
        return;
      }
      const here = lookup.get(keyOf(r, c));
      if (here && !here[directionRef.current]) {
        setDirection(otherDir(directionRef.current));
      }
      setActive({ row: r, col: c });
    },
    [isOpen, lookup],
  );

  // Move the cursor without changing the across/down orientation (scrubber).
  const moveTo = useCallback(
    (r: number, c: number) => {
      if (isOpen(r, c)) setActive({ row: r, col: c });
    },
    [isOpen],
  );

  const toggleDirection = useCallback(() => {
    const { row, col } = activeRef.current;
    const here = lookup.get(keyOf(row, col));
    if (here?.across && here?.down) setDirection(otherDir(directionRef.current));
  }, [lookup]);

  const selectClue = useCallback((clue: DirClue) => {
    setRebus(false);
    setDirection(clue.direction);
    setActive({ row: clue.row, col: clue.col });
  }, []);

  /** First empty cell in a clue, or its start if all filled. */
  const firstEmpty = useCallback((clue: DirClue): Pos => {
    for (const p of clueCells(clue)) {
      if (!entriesRef.current[p.row][p.col]) return p;
    }
    return { row: clue.row, col: clue.col };
  }, []);

  /** A clue is "done" once every one of its cells has a letter. */
  const isClueFilled = useCallback(
    (clue: DirClue): boolean =>
      clueCells(clue).every((p) => entriesRef.current[p.row][p.col]),
    [],
  );

  const moveToClue = useCallback(
    (delta: number) => {
      const cur = clueThrough(activeRef.current, directionRef.current);
      if (!cur) return;
      const n = orderedClues.length;
      const idx = orderedClues.findIndex(
        (c) => c.number === cur.number && c.direction === cur.direction,
      );
      if (idx < 0) return;
      // Walk in the requested direction, skipping clues that are completely
      // filled, and stop on the first one that still has an empty cell. If
      // every other clue is full, just step one clue over so the buttons still
      // do something.
      let target = (idx + delta + n) % n;
      for (let k = 1; k <= n; k++) {
        const j = (idx + delta * k + n) % n;
        if (j === idx) break; // came full circle — nothing open elsewhere
        if (!isClueFilled(orderedClues[j])) {
          target = j;
          break;
        }
      }
      const next = orderedClues[target];
      setRebus(false);
      setDirection(next.direction);
      setActive(firstEmpty(next));
    },
    [clueThrough, orderedClues, firstEmpty, isClueFilled],
  );

  const step = useCallback(
    (dr: number, dc: number) => {
      let r = activeRef.current.row + dr;
      let c = activeRef.current.col + dc;
      while (r >= 0 && c >= 0 && r < height && c < width) {
        if (isOpen(r, c)) {
          setActive({ row: r, col: c });
          return;
        }
        r += dr;
        c += dc;
      }
    },
    [isOpen, width, height],
  );

  /** Advance after typing a letter:
   *  1. next empty cell after the cursor;
   *  2. else the first empty cell earlier in the word (fill the gaps);
   *  3. else (word now full) either jump to the next open clue — if the
   *     "auto-advance" setting is on — or step one cell forward to re-write,
   *     anchored at the end. */
  const advanceInWord = useCallback(() => {
    const clue = clueThrough(activeRef.current, directionRef.current);
    if (!clue) return;
    const cells = clueCells(clue);
    const empty = (p: Pos) => !entriesRef.current[p.row][p.col];
    const cur = activeRef.current;
    const i = cells.findIndex((p) => p.row === cur.row && p.col === cur.col);

    for (let j = i + 1; j < cells.length; j++) {
      if (empty(cells[j])) return setActive(cells[j]);
    }
    // No empty cell after the cursor. Only jump to the next clue when the
    // cursor is on the word's *last* cell and the whole word is now full —
    // filling an earlier gap, or any non-final cell, behaves normally.
    const lastCell = i === cells.length - 1;
    if (getAutoAdvance() && lastCell && !cells.some(empty)) {
      return moveToClue(1);
    }
    const firstGap = cells.find(empty);
    if (firstGap) return setActive(firstGap);
    if (i + 1 < cells.length) setActive(cells[i + 1]);
  }, [clueThrough, moveToClue]);

  // ---- editing ------------------------------------------------------------

  const clearWrongAt = (r: number, c: number) => {
    if (!wrongRef.current.has(keyOf(r, c))) return;
    const next = new Set(wrongRef.current);
    next.delete(keyOf(r, c));
    setWrong(next);
  };

  // Editing a revealed cell drops its "revealed" marker so it's no longer
  // treated as locked help.
  const clearRevealedAt = (r: number, c: number) => {
    if (!revealedRef.current.has(keyOf(r, c))) return;
    const next = new Set(revealedRef.current);
    next.delete(keyOf(r, c));
    setRevealed(next);
  };

  const writeCell = (r: number, c: number, ch: string) => {
    const g = entriesRef.current.map((row) => row.slice());
    g[r][c] = ch;
    setEntries(g);
  };

  const clearAt = (r: number, c: number) => {
    writeCell(r, c, "");
    clearWrongAt(r, c);
    clearRevealedAt(r, c);
  };

  const typeLetter = useCallback(
    (ch: string) => {
      const { row, col } = activeRef.current;
      if (!isOpen(row, col)) return;
      if (rebusRef.current) {
        // Accumulate letters in the cell; stay put so a word can be entered.
        writeCell(row, col, entriesRef.current[row][col] + ch.toUpperCase());
        clearWrongAt(row, col);
        clearRevealedAt(row, col);
        return;
      }
      writeCell(row, col, ch.toUpperCase());
      clearWrongAt(row, col);
      clearRevealedAt(row, col);
      advanceInWord();
    },
    [isOpen, advanceInWord],
  );

  const backspace = useCallback(() => {
    const { row, col } = activeRef.current;
    const cur = entriesRef.current[row][col];
    // In rebus mode, peel one letter off a multi-letter cell.
    if (rebusRef.current && cur.length > 1) {
      writeCell(row, col, cur.slice(0, -1));
      clearWrongAt(row, col);
      return;
    }
    if (cur) {
      clearAt(row, col);
      return;
    }
    // Empty cell: step back within the word and clear that one.
    const clue = clueThrough(activeRef.current, directionRef.current);
    if (!clue) return;
    const cells = clueCells(clue);
    const i = cells.findIndex((p) => p.row === row && p.col === col);
    if (i > 0) {
      const prev = cells[i - 1];
      setActive(prev);
      clearAt(prev.row, prev.col);
    }
  }, [clueThrough]);

  const deleteCell = useCallback(() => {
    const { row, col } = activeRef.current;
    clearAt(row, col);
  }, []);

  // ---- check / reveal -----------------------------------------------------

  const scopeCells = useCallback(
    (scope: RevealScope): Pos[] => {
      if (scope === "cell") return [activeRef.current];
      if (scope === "word") {
        const clue = clueThrough(activeRef.current, directionRef.current);
        return clue ? clueCells(clue) : [activeRef.current];
      }
      const all: Pos[] = [];
      for (let r = 0; r < height; r++)
        for (let c = 0; c < width; c++)
          if (isOpen(r, c)) all.push({ row: r, col: c });
      return all;
    },
    [clueThrough, width, height, isOpen],
  );

  const check = useCallback(
    (scope: RevealScope) => {
      const cells = scopeCells(scope);
      const next = new Set(wrongRef.current);
      for (const { row, col } of cells) {
        const entry = entriesRef.current[row][col];
        const sol = grid[row][col].solution;
        if (entry && sol && entry !== sol) next.add(keyOf(row, col));
        else next.delete(keyOf(row, col));
      }
      setWrong(next);
    },
    [scopeCells, grid],
  );

  const reveal = useCallback(
    (scope: RevealScope) => {
      const cells = scopeCells(scope);
      const g = entriesRef.current.map((row) => row.slice());
      const rev = new Set(revealedRef.current);
      const wr = new Set(wrongRef.current);
      for (const { row, col } of cells) {
        const sol = grid[row][col].solution;
        if (sol) {
          g[row][col] = sol;
          rev.add(keyOf(row, col));
          wr.delete(keyOf(row, col));
        }
      }
      setEntries(g);
      setRevealed(rev);
      setWrong(wr);
    },
    [scopeCells, grid],
  );

  const reset = useCallback(() => {
    setEntries(blank());
    setRevealed(new Set());
    setWrong(new Set());
    setActive(firstOpen);
    setDirection("across");
  }, [firstOpen]);

  /** Write `text` across the active word's cells (used by the anagram helper). */
  const fillWord = useCallback(
    (text: string) => {
      const clue = clueThrough(activeRef.current, directionRef.current);
      if (!clue) return;
      const letters = text.toUpperCase().replace(/[^A-Z]/g, "").split("");
      const g = entriesRef.current.map((row) => row.slice());
      const wr = new Set(wrongRef.current);
      const rev = new Set(revealedRef.current);
      clueCells(clue).forEach((p, i) => {
        if (i < letters.length) {
          g[p.row][p.col] = letters[i];
          wr.delete(keyOf(p.row, p.col));
          rev.delete(keyOf(p.row, p.col));
        }
      });
      setEntries(g);
      setWrong(wr);
      setRevealed(rev);
    },
    [clueThrough],
  );

  // Cryptic puzzles get the anagram helper instead of the rebus toggle. An
  // authored puzzle states it outright; otherwise infer from the source type.
  const isCryptic = puzzle.cryptic ?? SOURCES[puzzle.source]?.type === "Cryptic";

  // ---- completion ---------------------------------------------------------

  const completed = useMemo(() => {
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        const sol = grid[r][c].solution;
        if (sol && entries[r][c] !== sol) return false;
      }
    return true;
  }, [entries, grid, width, height]);

  // ---- key handling -------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const k = e.key;
      // Check / reveal shortcuts (matching the Seattle Times bindings):
      //   Ctrl+B/R/G reveal box/word/grid; Ctrl+X/C/E check box/word/grid.
      if (e.ctrlKey && !e.metaKey && !e.altKey) {
        const combos: Record<string, () => void> = {
          b: () => reveal("cell"),
          r: () => reveal("word"),
          g: () => reveal("puzzle"),
          x: () => check("cell"),
          c: () => check("word"),
          e: () => check("puzzle"),
        };
        const act = combos[k.toLowerCase()];
        if (act) {
          e.preventDefault();
          act();
        }
        return;
      }
      if (k === "ArrowLeft") {
        e.preventDefault();
        if (directionRef.current !== "across") setDirection("across");
        else step(0, -1);
      } else if (k === "ArrowRight") {
        e.preventDefault();
        if (directionRef.current !== "across") setDirection("across");
        else step(0, 1);
      } else if (k === "ArrowUp") {
        e.preventDefault();
        if (directionRef.current !== "down") setDirection("down");
        else step(-1, 0);
      } else if (k === "ArrowDown") {
        e.preventDefault();
        if (directionRef.current !== "down") setDirection("down");
        else step(1, 0);
      } else if (k === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (k === "Delete") {
        e.preventDefault();
        deleteCell();
      } else if (k === "Tab") {
        e.preventDefault();
        moveToClue(e.shiftKey ? -1 : 1);
      } else if (k === " " || k === "Enter") {
        e.preventDefault();
        toggleDirection();
      } else if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        typeLetter(k);
      }
    },
    [step, backspace, deleteCell, moveToClue, toggleDirection, typeLetter, check, reveal],
  );

  return {
    // state (for rendering)
    entries,
    active,
    direction,
    activeClue,
    revealed,
    wrong,
    highlighted,
    linked,
    linkedNumbers,
    rebus,
    completed,
    openCells,
    isCryptic,
    // derived helpers
    clueAt,
    solutionAt,
    // actions
    selectCell,
    selectClue,
    moveTo,
    toggleDirection,
    setDirection,
    toggleRebus,
    moveToClue,
    typeLetter,
    backspace,
    handleKeyDown,
    check,
    reveal,
    reset,
    fillWord,
  };
}

export type Crossword = ReturnType<typeof useCrossword>;
