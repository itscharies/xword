import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, Direction, Puzzle } from "../types.ts";
import { numberGrid, readWord, slotCells, type WordStart } from "../lib/numbering.ts";
import { appendRefs, refLabel, splitGeneratedRefs, stripRefs } from "../lib/clueRefs.ts";
import { splitEnumeration } from "../lib/enumeration.ts";
import { loadWordSet } from "../lib/wordlist.ts";
import { useAutofill } from "./useAutofill.ts";

export type BuilderMode = "paint" | "fill";

export interface Pos {
  row: number;
  col: number;
}

const keyOf = (r: number, c: number) => `${r},${c}`;
const otherDir = (d: Direction): Direction =>
  d === "across" ? "down" : "across";

/** Key a clue slot by its start cell + direction, so the typed clue text stays
 *  attached to the right word even when the grid renumbers. */
export const slotKey = (s: { row: number; col: number; direction: Direction }) =>
  `${s.row},${s.col},${s.direction}`;

/** Enumeration for a word, split at the bars inside it: "7" with no bars, or
 *  "3,4" when a bar falls after the 3rd cell (the cryptic-style length hint). */
export function enumerationOf(grid: Cell[][], s: WordStart): string {
  const parts: number[] = [];
  let run = 0;
  for (let i = 0; i < s.len; i++) {
    const r = s.direction === "down" ? s.row + i : s.row;
    const c = s.direction === "across" ? s.col + i : s.col;
    run++;
    const cell = grid[r][c];
    const bar = s.direction === "across" ? cell.barRight : cell.barBottom;
    if (bar && i < s.len - 1) {
      parts.push(run);
      run = 0;
    }
  }
  parts.push(run);
  return parts.join(",");
}

const blankCell = (): Cell => ({});

function makeGrid(w: number, h: number, prev?: Cell[][]): Cell[][] {
  const g: Cell[][] = [];
  for (let r = 0; r < h; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < w; c++) {
      // Preserve any overlapping cell from the previous grid on resize.
      row.push(prev && prev[r] && prev[r][c] ? { ...prev[r][c] } : blankCell());
    }
    g.push(row);
  }
  return g;
}

const DEFAULT_SIZE = 15;

/**
 * Authoring engine for the `/new` builder. Mirrors `useCrossword`'s navigation
 * and typing, but writes letters and decorations straight into the grid cells
 * (the puzzle being built) rather than a separate `entries` array. Refs mirror
 * the mutable state so synchronous key bursts read fresh values.
 */
export function useBuilder() {
  // Nothing is persisted locally: work lives in memory until it's saved as a
  // server draft or published, and the `dirty` flag below drives the
  // leave-page warnings that stand in for the old localStorage autosave.
  const [width, setWidthState] = useState(DEFAULT_SIZE);
  const [height, setHeightState] = useState(DEFAULT_SIZE);
  const [linked, setLinked] = useState(true);
  const [symmetry, setSymmetry] = useState(true);
  // Cryptic puzzles offer the anagram helper and carry clue enumerations.
  const [cryptic, setCryptic] = useState(false);
  // Set a "(3,4)" length enumeration on each clue on export (cryptic style).
  const [autoEnumerate, setAutoEnumerate] = useState(false);

  const [grid, setGridState] = useState<Cell[][]>(() =>
    makeGrid(DEFAULT_SIZE, DEFAULT_SIZE),
  );
  const [active, setActiveState] = useState<Pos>({ row: 0, col: 0 });
  const [direction, setDirectionState] = useState<Direction>("across");
  const [mode, setModeState] = useState<BuilderMode>("paint");
  const [rebus, setRebusState] = useState(false);
  // Multi-select cells (shift-click / marquee). Group typing & delete apply to
  // every cell in here; empty means normal single-cell editing.
  const [selected, setSelectedState] = useState<Set<string>>(() => new Set());
  const [clueText, setClueText] = useState<Map<string, string>>(() => new Map());
  // Cross-references: source slot key -> target slot keys it links to. Keyed by
  // slot (row,col,direction), so links survive renumbering like clue text does.
  const [links, setLinks] = useState<Map<string, string[]>>(() => new Map());

  // Metadata for export.
  const [title, setTitle] = useState("Untitled");
  const [author, setAuthor] = useState("");
  const [editor, setEditor] = useState("");
  const [date, setDate] = useState("");

  const gridRef = useRef(grid);
  const activeRef = useRef(active);
  const directionRef = useRef(direction);
  const modeRef = useRef(mode);
  const rebusRef = useRef(rebus);
  const symmetryRef = useRef(symmetry);
  const selectedRef = useRef(selected);

  const setGrid = (g: Cell[][]) => {
    gridRef.current = g;
    setGridState(g);
  };
  const setActive = (p: Pos) => {
    activeRef.current = p;
    setActiveState(p);
  };
  const setDirection = (d: Direction) => {
    directionRef.current = d;
    setDirectionState(d);
  };
  const setMode = (m: BuilderMode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const setRebus = (v: boolean) => {
    rebusRef.current = v;
    setRebusState(v);
  };
  const toggleRebus = useCallback(() => setRebus(!rebusRef.current), []);
  const setSelected = (s: Set<string>) => {
    selectedRef.current = s;
    setSelectedState(s);
  };
  const clearSelection = () => {
    if (selectedRef.current.size) setSelected(new Set());
  };
  const toggleSymmetry = useCallback(() => {
    symmetryRef.current = !symmetryRef.current;
    setSymmetry(symmetryRef.current);
  }, []);
  // Switching to cryptic turns clue enumerations on (and regular turns them
  // off) as a sensible preset; the lengths toggle can still be set on its own.
  const toggleCryptic = useCallback(() => {
    setCryptic((c) => {
      const next = !c;
      setAutoEnumerate(next);
      return next;
    });
  }, []);
  const toggleAutoEnumerate = useCallback(() => setAutoEnumerate((v) => !v), []);

  // ---- derived: numbering + slots -----------------------------------------

  const { numbered, acrossStarts, downStarts, lookup, startByKey } = useMemo(() => {
    // Clone so numberGrid can stamp `number` without mutating the state grid.
    const clone = grid.map((row) => row.map((c) => ({ ...c })));
    const starts = numberGrid(clone);
    const map = new Map<string, { across?: WordStart; down?: WordStart }>();
    const byKey = new Map<string, WordStart>();
    for (const s of starts) {
      byKey.set(slotKey(s), s);
      for (const p of slotCells(s)) {
        const entry = map.get(keyOf(p.row, p.col)) ?? {};
        entry[s.direction] = s;
        map.set(keyOf(p.row, p.col), entry);
      }
    }
    return {
      numbered: clone,
      acrossStarts: starts.filter((s) => s.direction === "across"),
      downStarts: starts.filter((s) => s.direction === "down"),
      lookup: map,
      startByKey: byKey,
    };
  }, [grid]);

  const orderedStarts = useMemo<WordStart[]>(
    () => [...acrossStarts, ...downStarts],
    [acrossStarts, downStarts],
  );

  const isOpen = useCallback(
    (r: number, c: number) =>
      r >= 0 &&
      c >= 0 &&
      r < gridRef.current.length &&
      c < gridRef.current[0].length &&
      !gridRef.current[r][c].black,
    [],
  );

  const slotThrough = useCallback(
    (pos: Pos, dir: Direction): WordStart | undefined => {
      const here = lookup.get(keyOf(pos.row, pos.col));
      return here?.[dir] ?? here?.[otherDir(dir)];
    },
    [lookup],
  );

  const slotAt = useCallback(
    (r: number, c: number, dir: Direction): WordStart | undefined =>
      lookup.get(keyOf(r, c))?.[dir],
    [lookup],
  );

  const activeSlot = useMemo<WordStart | undefined>(
    () => slotThrough(active, direction),
    [slotThrough, active, direction],
  );

  // The active word as a fill pattern: each cell's letters, or "." if empty.
  // Rebus cells contribute their full string, so the pattern tracks the
  // answer's letters (not the cell count) and suggestions must spell the rebus.
  // Used to query the suggestion word list.
  const activePattern = useMemo<string | null>(() => {
    if (!activeSlot) return null;
    return slotCells(activeSlot)
      .map((p) => numbered[p.row][p.col].solution || ".")
      .join("");
  }, [activeSlot, numbered]);

  // "Is this a real word" index for the unknown-word highlight, loaded (with
  // the rest of the word list machinery) once the author enters fill mode.
  const [wordSet, setWordSet] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (mode !== "fill" || wordSet) return;
    let live = true;
    loadWordSet()
      .then((s) => live && setWordSet(s))
      .catch(() => {}); // no highlight without the list; suggestions surface the error
    return () => {
      live = false;
    };
  }, [mode, wordSet]);

  // Cells of complete words the word list doesn't know — flagged in the grid
  // so a doubtful corner shows up at a glance while filling.
  const unknownCells = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!wordSet) return set;
    for (const s of orderedStarts) {
      const cells = slotCells(s);
      let word = "";
      for (const p of cells) {
        const sol = numbered[p.row][p.col].solution;
        if (!sol) {
          word = "";
          break;
        }
        word += sol;
      }
      if (word && !wordSet.has(word))
        for (const p of cells) set.add(keyOf(p.row, p.col));
    }
    return set;
  }, [wordSet, orderedStarts, numbered]);

  // Background fill search + the ghost proposal overlay it produces.
  const autofill = useAutofill({ numbered, orderedStarts, gridRef, setGrid });

  // Decoration flags of the active cell — drives the toggle buttons' on state.
  const activeProps = useMemo(() => {
    const cell = numbered[active.row]?.[active.col];
    return {
      circled: !!cell?.circled,
      shaded: !!cell?.shaded,
      barRight: !!cell?.barRight,
      barBottom: !!cell?.barBottom,
    };
  }, [numbered, active]);

  const highlighted = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (rebus || mode === "paint") return set;
    if (activeSlot)
      for (const p of slotCells(activeSlot)) set.add(keyOf(p.row, p.col));
    return set;
  }, [activeSlot, rebus, mode]);

  // Slot keys the active clue links to, and the cells of those linked words —
  // mirrors the solver's cross-reference highlight.
  const activeLinks = useMemo<string[]>(
    () => (activeSlot ? links.get(slotKey(activeSlot)) ?? [] : []),
    [activeSlot, links],
  );
  const linkedCells = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (mode === "paint") return set;
    for (const key of activeLinks) {
      const target = startByKey.get(key);
      if (target)
        for (const p of slotCells(target)) set.add(keyOf(p.row, p.col));
    }
    return set;
  }, [activeLinks, startByKey, mode]);

  const linkClue = useCallback((source: string, target: string) => {
    if (source === target) return;
    setLinks((prev) => {
      const next = new Map(prev);
      const arr = next.get(source) ?? [];
      if (!arr.includes(target)) next.set(source, [...arr, target]);
      return next;
    });
  }, []);
  const unlinkClue = useCallback((source: string, target: string) => {
    setLinks((prev) => {
      const next = new Map(prev);
      const arr = (next.get(source) ?? []).filter((t) => t !== target);
      if (arr.length) next.set(source, arr);
      else next.delete(source);
      return next;
    });
  }, []);

  // ---- grid editing helpers (immutable) -----------------------------------

  const mutate = (cells: Pos[], patch: (cell: Cell) => void) => {
    const g = gridRef.current.map((row) => row.map((c) => ({ ...c })));
    for (const { row, col } of cells) {
      if (row >= 0 && col >= 0 && row < g.length && col < g[0].length) {
        patch(g[row][col]);
      }
    }
    setGrid(g);
  };

  const writeCell = (r: number, c: number, text: string) =>
    mutate([{ row: r, col: c }], (cell) => {
      if (text) {
        cell.solution = text;
        cell.rebus = text.length > 1 ? true : undefined;
      } else {
        delete cell.solution;
        delete cell.rebus;
      }
    });

  // ---- paint mode ---------------------------------------------------------

  const mirror = (r: number, c: number): Pos => ({
    row: gridRef.current.length - 1 - r,
    col: gridRef.current[0].length - 1 - c,
  });

  const setBlack = useCallback((r: number, c: number, black: boolean) => {
    const targets: Pos[] = [{ row: r, col: c }];
    if (symmetryRef.current) {
      const m = mirror(r, c);
      if (m.row !== r || m.col !== c) targets.push(m);
    }
    mutate(targets, (cell) => {
      if (black) {
        cell.black = true;
        delete cell.solution;
        delete cell.rebus;
        delete cell.circled;
        delete cell.shaded;
        delete cell.barRight;
        delete cell.barBottom;
      } else {
        delete cell.black;
      }
    });
  }, []);

  const paintCell = useCallback(
    (r: number, c: number) => setBlack(r, c, !gridRef.current[r][c].black),
    [setBlack],
  );

  // ---- navigation (fill mode) ---------------------------------------------

  const selectCell = useCallback(
    (r: number, c: number, additive = false) => {
      if (modeRef.current === "paint") {
        setActive({ row: r, col: c });
        return;
      }
      if (!isOpen(r, c)) return;
      // Shift-click builds a multi-selection, seeded with the current cell.
      if (additive) {
        const next = new Set(selectedRef.current);
        if (next.size === 0)
          next.add(keyOf(activeRef.current.row, activeRef.current.col));
        const k = keyOf(r, c);
        if (next.has(k) && next.size > 1) next.delete(k);
        else next.add(k);
        setSelected(next);
        setActive({ row: r, col: c });
        return;
      }
      clearSelection();
      const cur = activeRef.current;
      if (cur.row === r && cur.col === c) {
        const here = lookup.get(keyOf(r, c));
        if (here?.across && here?.down)
          setDirection(otherDir(directionRef.current));
        return;
      }
      const here = lookup.get(keyOf(r, c));
      if (here && !here[directionRef.current])
        setDirection(otherDir(directionRef.current));
      setActive({ row: r, col: c });
    },
    [isOpen, lookup],
  );

  /** Apply a marquee block to the multi-selection. "replace" starts fresh,
   *  "add" unions, "remove" subtracts (shift-drag over already-selected cells).
   *  Only open cells are affected. */
  const selectCells = useCallback(
    (cells: Pos[], op: "replace" | "add" | "remove") => {
      const open = cells.filter((p) => isOpen(p.row, p.col));
      if (open.length <= 1 && op === "replace") {
        // A tiny drag over one cell behaves like a plain click.
        if (open.length === 1) selectCell(open[0].row, open[0].col);
        return;
      }
      const next =
        op === "replace" ? new Set<string>() : new Set(selectedRef.current);
      for (const p of open) {
        const k = keyOf(p.row, p.col);
        if (op === "remove") next.delete(k);
        else next.add(k);
      }
      setSelected(next);
      if (op !== "remove" && open.length) setActive(open[0]);
    },
    [isOpen, selectCell],
  );

  /** Escape from a multi-selection: collapse to its first cell (reading order). */
  const collapseSelection = useCallback(() => {
    const sel = selectedRef.current;
    if (!sel.size) return;
    let first: Pos | null = null;
    for (const key of sel) {
      const [r, c] = key.split(",").map(Number);
      if (!first || r < first.row || (r === first.row && c < first.col))
        first = { row: r, col: c };
    }
    setSelected(new Set());
    if (first) setActive(first);
  }, []);

  const toggleDirection = useCallback(() => {
    clearSelection();
    const { row, col } = activeRef.current;
    const here = lookup.get(keyOf(row, col));
    if (here?.across && here?.down)
      setDirection(otherDir(directionRef.current));
  }, [lookup]);

  const selectSlot = useCallback((s: WordStart) => {
    clearSelection();
    setRebus(false);
    setMode("fill");
    setDirection(s.direction);
    setActive({ row: s.row, col: s.col });
  }, []);

  const step = useCallback((dr: number, dc: number) => {
    clearSelection();
    let r = activeRef.current.row + dr;
    let c = activeRef.current.col + dc;
    const h = gridRef.current.length;
    const w = gridRef.current[0].length;
    while (r >= 0 && c >= 0 && r < h && c < w) {
      // In paint mode every cell is selectable; in fill mode skip black cells.
      if (modeRef.current === "paint" || !gridRef.current[r][c].black) {
        setActive({ row: r, col: c });
        return;
      }
      r += dr;
      c += dc;
    }
  }, []);

  const moveToClue = useCallback(
    (delta: number) => {
      clearSelection();
      const cur = slotThrough(activeRef.current, directionRef.current);
      const n = orderedStarts.length;
      if (!n) return;
      let idx = cur
        ? orderedStarts.findIndex(
            (s) => s.row === cur.row && s.col === cur.col && s.direction === cur.direction,
          )
        : -1;
      if (idx < 0) idx = 0;
      const next = orderedStarts[(idx + delta + n) % n];
      setRebus(false);
      setDirection(next.direction);
      setActive({ row: next.row, col: next.col });
    },
    [slotThrough, orderedStarts],
  );

  const advanceInWord = useCallback(() => {
    const slot = slotThrough(activeRef.current, directionRef.current);
    if (!slot) return;
    const cells = slotCells(slot);
    const cur = activeRef.current;
    const i = cells.findIndex((p) => p.row === cur.row && p.col === cur.col);
    if (i >= 0 && i + 1 < cells.length) setActive(cells[i + 1]);
  }, [slotThrough]);

  // ---- typing -------------------------------------------------------------

  // Cells of the current multi-selection as positions.
  const selectedCells = () =>
    [...selectedRef.current].map((k) => {
      const [r, c] = k.split(",").map(Number);
      return { row: r, col: c };
    });

  const typeLetter = useCallback(
    (ch: string) => {
      // Multi-select: apply to every selected cell (no advance). In rebus mode
      // the letter accumulates onto each cell; otherwise it replaces.
      if (selectedRef.current.size > 0) {
        const c2 = ch.toUpperCase();
        mutate(selectedCells(), (cell) => {
          const next = rebusRef.current ? (cell.solution ?? "") + c2 : c2;
          cell.solution = next;
          cell.rebus = next.length > 1 ? true : undefined;
        });
        return;
      }
      const { row, col } = activeRef.current;
      if (!isOpen(row, col)) return;
      if (rebusRef.current) {
        const cur = gridRef.current[row][col].solution ?? "";
        writeCell(row, col, (cur + ch).toUpperCase());
        return;
      }
      writeCell(row, col, ch.toUpperCase());
      advanceInWord();
    },
    [isOpen, advanceInWord],
  );

  // Clear the entries of every selected cell (used by Delete).
  const clearSelectedEntries = () => {
    mutate(selectedCells(), (cell) => {
      delete cell.solution;
      delete cell.rebus;
    });
  };

  const backspace = useCallback(() => {
    if (selectedRef.current.size > 0) {
      // In rebus mode peel one letter off each multi-letter cell; otherwise
      // (or once down to a single letter) clear the selected cells.
      if (rebusRef.current) {
        mutate(selectedCells(), (cell) => {
          const cur = cell.solution ?? "";
          if (cur.length > 1) {
            const next = cur.slice(0, -1);
            cell.solution = next;
            cell.rebus = next.length > 1 ? true : undefined;
          } else {
            delete cell.solution;
            delete cell.rebus;
          }
        });
      } else {
        clearSelectedEntries();
      }
      return;
    }
    const { row, col } = activeRef.current;
    const cur = gridRef.current[row][col].solution ?? "";
    if (rebusRef.current && cur.length > 1) {
      writeCell(row, col, cur.slice(0, -1));
      return;
    }
    if (cur) {
      writeCell(row, col, "");
      return;
    }
    const slot = slotThrough(activeRef.current, directionRef.current);
    if (!slot) return;
    const cells = slotCells(slot);
    const i = cells.findIndex((p) => p.row === row && p.col === col);
    if (i > 0) {
      const prev = cells[i - 1];
      setActive(prev);
      writeCell(prev.row, prev.col, "");
    }
  }, [slotThrough]);

  const deleteCell = useCallback(() => {
    if (selectedRef.current.size > 0) {
      clearSelectedEntries();
      return;
    }
    const { row, col } = activeRef.current;
    writeCell(row, col, "");
  }, []);

  /** Write a whole word across the active slot (from the suggestion list).
   *  Rebus cells keep their width: each consumes as many letters as it holds,
   *  matching how activePattern expanded them for the suggestion query. */
  const fillSlot = useCallback(
    (word: string) => {
      const slot = slotThrough(activeRef.current, directionRef.current);
      if (!slot) return;
      const letters = word.toUpperCase().replace(/[^A-Z]/g, "");
      const g = gridRef.current.map((row) => row.map((c) => ({ ...c })));
      let i = 0;
      for (const p of slotCells(slot)) {
        const cell = g[p.row][p.col];
        const take = cell.rebus ? (cell.solution ?? "").length || 1 : 1;
        const chunk = letters.slice(i, i + take);
        if (!chunk) break;
        cell.solution = chunk;
        cell.rebus = chunk.length > 1 ? true : undefined;
        i += take;
      }
      setGrid(g);
    },
    [slotThrough],
  );

  // ---- per-cell decorations -----------------------------------------------

  const toggleProp = useCallback(
    (prop: "circled" | "shaded" | "barRight" | "barBottom") => {
      // Target the whole selection if there is one, else the active cell.
      const targets = (
        selectedRef.current.size > 0
          ? selectedCells()
          : [activeRef.current]
      ).filter((p) => isOpen(p.row, p.col));
      if (!targets.length) return;
      // Toggle as a group: turn on unless every target already has it.
      const anyOff = targets.some((p) => !gridRef.current[p.row][p.col][prop]);
      mutate(targets, (cell) => {
        if (anyOff) cell[prop] = true;
        else delete cell[prop];
      });
    },
    [isOpen],
  );

  // ---- size ---------------------------------------------------------------

  const applySize = useCallback((w: number, h: number) => {
    const cw = Math.max(1, Math.min(40, Math.floor(w) || 1));
    const ch = Math.max(1, Math.min(40, Math.floor(h) || 1));
    setWidthState(cw);
    setHeightState(ch);
    setGrid(makeGrid(cw, ch, gridRef.current));
    const a = activeRef.current;
    if (a.row >= ch || a.col >= cw) setActive({ row: 0, col: 0 });
  }, []);

  const setSize = useCallback(
    (n: number) => applySize(n, n),
    [applySize],
  );
  const setWidth = useCallback(
    (w: number) => applySize(w, linked ? w : height),
    [applySize, linked, height],
  );
  const setHeight = useCallback(
    (h: number) => applySize(linked ? h : width, h),
    [applySize, linked, width],
  );
  const toggleLink = useCallback(() => {
    setLinked((v) => {
      const next = !v;
      // Re-squaring: collapse to a square using the current width.
      if (next && gridRef.current[0].length !== gridRef.current.length) {
        applySize(gridRef.current[0].length, gridRef.current[0].length);
      }
      return next;
    });
  }, [applySize]);

  const setClue = useCallback((key: string, text: string) => {
    setClueText((prev) => {
      const next = new Map(prev);
      if (text) next.set(key, text);
      else next.delete(key);
      return next;
    });
  }, []);

  // ---- key handling -------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const k = e.key;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === "Escape") {
        if (selectedRef.current.size) {
          e.preventDefault();
          collapseSelection();
        }
        return;
      }
      if (k === "ArrowLeft") {
        e.preventDefault();
        if (directionRef.current !== "across" && modeRef.current === "fill")
          setDirection("across");
        else step(0, -1);
      } else if (k === "ArrowRight") {
        e.preventDefault();
        if (directionRef.current !== "across" && modeRef.current === "fill")
          setDirection("across");
        else step(0, 1);
      } else if (k === "ArrowUp") {
        e.preventDefault();
        if (directionRef.current !== "down" && modeRef.current === "fill")
          setDirection("down");
        else step(-1, 0);
      } else if (k === "ArrowDown") {
        e.preventDefault();
        if (directionRef.current !== "down" && modeRef.current === "fill")
          setDirection("down");
        else step(1, 0);
      } else if (modeRef.current === "paint") {
        if (k === " " || k === "Enter") {
          e.preventDefault();
          const { row, col } = activeRef.current;
          paintCell(row, col);
        }
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
    [step, paintCell, backspace, deleteCell, moveToClue, toggleDirection, typeLetter, collapseSelection],
  );

  // ---- export -------------------------------------------------------------

  const buildPuzzle = useCallback((): Puzzle => {
    const clone = grid.map((row) => row.map((c) => ({ ...c })));
    const starts = numberGrid(clone);
    const byKey = new Map(starts.map((s) => [slotKey(s), s]));
    const toClue = (s: WordStart) => {
      // Keep the clue text clean; the length goes in its own `enumeration`
      // field. Strip any enumeration the author typed so it isn't duplicated.
      const split = splitEnumeration((clueText.get(slotKey(s)) ?? "").trim());
      const enumeration = autoEnumerate
        ? enumerationOf(clone, s)
        : split.enumeration;
      // Render cross-references into the clue text so the solver's parseClueRefs
      // links them, e.g. "See 14-Across" / "<clue> (see 14-Across, 3-Down)".
      const labels = (links.get(slotKey(s)) ?? [])
        .map((k) => byKey.get(k))
        .filter((t): t is WordStart => Boolean(t))
        .map((t) => refLabel(t.number, t.direction));
      const clue = appendRefs(split.clue, labels);
      return {
        number: s.number,
        clue,
        answer: readWord(clone, s),
        row: s.row,
        col: s.col,
        len: s.len,
        ...(enumeration ? { enumeration } : {}),
      };
    };
    const iso = date || "";
    let weekday = "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      weekday = new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short",
      });
    }
    // The refs are already baked into the clue text above for solvers; this
    // structured copy, pruned to slots the exported grid still has, is what
    // importPuzzle restores so the links stay editable across a draft
    // round-trip.
    const exportLinks = [...links]
      .map(([source, targets]) =>
        [source, targets.filter((t) => byKey.has(t))] as [string, string[]])
      .filter(([source, targets]) => byKey.has(source) && targets.length > 0);
    return {
      date: iso.replace(/-/g, ""),
      isoDate: iso,
      weekday,
      title,
      author,
      editor,
      width,
      height,
      cryptic,
      grid: clone,
      clues: {
        across: starts.filter((s) => s.direction === "across").map(toClue),
        down: starts.filter((s) => s.direction === "down").map(toClue),
      },
      ...(exportLinks.length ? { links: exportLinks } : {}),
    };
  }, [grid, clueText, links, date, title, author, editor, width, height, autoEnumerate, cryptic]);

  // Unsaved-changes flag, driving the leave-page warnings in Builder.tsx.
  // Any content edit sets it (cursor, mode and selection moves don't count);
  // saving a draft/fix or publishing marks the state clean again, and
  // importPuzzle/clearDraft pre-arm a skip so their own writes don't count.
  // Comparing dep identities against the last run makes StrictMode's
  // re-invoked effects (same references) a no-op instead of a false dirty.
  const [dirty, setDirty] = useState(false);
  const skipDirtyRef = useRef(false);
  const lastContentRef = useRef<unknown[] | null>(null);
  useEffect(() => {
    const content = [
      width, height, cryptic, autoEnumerate, grid, clueText, links,
      title, author, editor, date,
    ];
    if (lastContentRef.current) {
      if (content.every((v, i) => Object.is(v, lastContentRef.current![i])))
        return;
      lastContentRef.current = content;
      if (skipDirtyRef.current) skipDirtyRef.current = false;
      else setDirty(true);
    } else {
      lastContentRef.current = content; // mount, not an edit
    }
  }, [
    width, height, cryptic, autoEnumerate, grid, clueText, links,
    title, author, editor, date,
  ]);

  /** The current state is safe on the server (draft saved / published). */
  const markClean = useCallback(() => setDirty(false), []);

  // Reset to a blank builder (the "New / Clear" button). Nothing is stored
  // anywhere, so this is a plain in-place state reset.
  const clearDraft = useCallback(() => {
    skipDirtyRef.current = true;
    setWidthState(DEFAULT_SIZE);
    setHeightState(DEFAULT_SIZE);
    setLinked(true);
    symmetryRef.current = true;
    setSymmetry(true);
    setCryptic(false);
    setAutoEnumerate(false);
    setGrid(makeGrid(DEFAULT_SIZE, DEFAULT_SIZE));
    setActive({ row: 0, col: 0 });
    setDirection("across");
    setMode("paint");
    setRebus(false);
    setSelected(new Set());
    setClueText(new Map());
    setLinks(new Map());
    setTitle("Untitled");
    setAuthor("");
    setEditor("");
    setDate("");
    setDirty(false);
  }, []);

  // Load an already-parsed Puzzle (a Supabase draft being continued, or a
  // syndicated one an admin is fixing) into the editing state, replacing
  // whatever was being edited. Loading isn't an edit: the state starts clean.
  const importPuzzle = useCallback((puzzle: Puzzle) => {
    skipDirtyRef.current = true;
    setDirty(false);
    setWidthState(puzzle.width);
    setHeightState(puzzle.height);
    setLinked(puzzle.width === puzzle.height);
    setGrid(puzzle.grid.map((row) => row.map((c) => ({ ...c }))));
    setActive({ row: 0, col: 0 });
    setDirection("across");
    setMode("fill");
    setCryptic(Boolean(puzzle.cryptic));

    // Rebuild clue text and structured links together. buildPuzzle writes
    // links twice — baked into the clue text for solvers, and structurally
    // in puzzle.links — so restore the structure and strip the baked text,
    // or it reads as authored text and doubles up on the next export.
    // Drafts saved before puzzle.links existed (and syndicated clues like
    // "See 5-Down") only have the text: when a clue ends in exactly the
    // generated format, recover it into a real link the same way.
    const clueList = [
      ...puzzle.clues.across.map((c) => ({ c, direction: "across" as Direction })),
      ...puzzle.clues.down.map((c) => ({ c, direction: "down" as Direction })),
    ];
    const keyOfClue = ({ c, direction }: (typeof clueList)[number]) =>
      slotKey({ row: c.row, col: c.col, direction });
    const keyByNumber = new Map(clueList.map((e) => [`${e.c.number}-${e.direction}`, keyOfClue(e)]));
    const labelByKey = new Map(clueList.map((e) => [keyOfClue(e), refLabel(e.c.number, e.direction)]));

    const nextLinks = new Map<string, string[]>(
      (puzzle.links ?? [])
        .map(([source, targets]) =>
          [source, targets.filter((t) => labelByKey.has(t))] as [string, string[]])
        .filter(([source, targets]) => labelByKey.has(source) && targets.length > 0),
    );

    const nextClueText = new Map<string, string>();
    for (const e of clueList) {
      const key = keyOfClue(e);
      let text = e.c.clue;
      const targets = nextLinks.get(key);
      if (targets) {
        text = stripRefs(text, targets.map((t) => labelByKey.get(t)!));
      } else {
        const generated = splitGeneratedRefs(text);
        if (generated) {
          const keys = generated.refs
            .map((r) => keyByNumber.get(`${r.number}-${r.direction}`))
            .filter((k): k is string => Boolean(k) && k !== key);
          // Only convert when every ref resolves to a real, other slot —
          // anything else is authored prose and stays in the text.
          if (keys.length === generated.refs.length) {
            nextLinks.set(key, keys);
            text = generated.clue;
          }
        }
      }
      nextClueText.set(key, text);
    }
    setLinks(nextLinks);
    setClueText(nextClueText);

    setTitle(puzzle.title);
    setAuthor(puzzle.author);
    setEditor(puzzle.editor);
    setDate(puzzle.isoDate || puzzle.date);
  }, []);

  return {
    // dimensions
    width,
    height,
    linked,
    symmetry,
    cryptic,
    autoEnumerate,
    setSize,
    setWidth,
    setHeight,
    toggleLink,
    toggleSymmetry,
    toggleCryptic,
    toggleAutoEnumerate,
    clearDraft,
    // Unsaved-changes tracking (nothing persists locally).
    dirty,
    markClean,
    // grid + render state
    grid: numbered,
    active,
    direction,
    mode,
    rebus,
    highlighted,
    linkedCells,
    selected,
    activeSlot,
    activePattern,
    activeProps,
    unknownCells,
    autofill,
    acrossStarts,
    downStarts,
    clueText,
    links,
    activeLinks,
    isCryptic: false as const,
    // metadata
    title,
    author,
    editor,
    date,
    setTitle,
    setAuthor,
    setEditor,
    setDate,
    // derived helpers
    slotAt,
    // actions
    setMode,
    selectCell,
    selectCells,
    collapseSelection,
    paintCell,
    setBlack,
    selectSlot,
    toggleDirection,
    toggleRebus,
    typeLetter,
    backspace,
    deleteCell,
    toggleProp,
    setClue,
    fillSlot,
    linkClue,
    unlinkClue,
    handleKeyDown,
    buildPuzzle,
    importPuzzle,
  };
}

export type Builder = ReturnType<typeof useBuilder>;
