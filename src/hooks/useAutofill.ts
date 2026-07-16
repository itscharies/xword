import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "../types.ts";
import { slotCells, type WordStart } from "../lib/numbering.ts";
import type {
  FillRequest,
  FillResponse,
  FillSolution,
  SlotSpec,
  WorkerRequest,
} from "../lib/autofill.ts";

// Bound on the background search: how many candidate words it may try before
// giving up. A CPU bound, not a memory one — at ~14µs a word this is around a
// minute of worst-case background time, streaming and cancellable throughout.
const NODE_BUDGET = 4_000_000;
// Stop after this many fills: nobody cycles further than this, and on easy
// grids an uncapped enumeration would spend the whole budget piling up
// options (the one list that grows without bound). Hard grids — fills rare
// or none found yet — get the full budget.
const SOLUTION_CAP = 200;

const keyOf = (r: number, c: number) => `${r},${c}`;

export interface AutofillDeps {
  numbered: Cell[][];
  orderedStarts: WordStart[];
  /** The word under the cursor when the search starts: it's filled first, so
   *  the options each try a different word there and branch out from it. */
  activeSlot?: WordStart;
  gridRef: React.MutableRefObject<Cell[][]>;
  setGrid: (g: Cell[][]) => void;
}

/**
 * Background "fill it in for me" for the builder: ships the current slots to
 * a worker that searches the word list for complete fills. Options stream in
 * as the search finds them and are held as a ghost proposal (letters overlaid
 * on the grid) the author can cycle through and accept — even while the
 * search is still adding more. Any grid edit invalidates a running search or
 * pending proposal — it was computed against the old letters.
 */
export function useAutofill({
  numbered,
  orderedStarts,
  activeSlot,
  gridRef,
  setGrid,
}: AutofillDeps) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [options, setOptions] = useState<FillSolution[]>([]);
  const [index, setIndex] = useState(0);
  const [nodes, setNodes] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per cell, how many of the found fills use each letter there. The grid
  // badges a ghost square the options disagree on with the shown letter's
  // share of the fills ("3/8"); squares every fill agrees on get no badge.
  const [variants, setVariants] = useState<Map<string, Map<string, number>>>(
    new Map(),
  );

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  // Mutable tallies behind `variants`, snapshotted into state per solution —
  // O(cells) per streamed solution either way.
  const countsRef = useRef(new Map<string, Map<string, number>>());

  const clearVariants = useCallback(() => {
    countsRef.current = new Map();
    setVariants(new Map());
  }, []);

  const ensureWorker = () => {
    if (!workerRef.current) {
      const w = new Worker(new URL("../workers/fill.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e: MessageEvent<FillResponse>) => {
        const msg = e.data;
        if (msg.runId !== runIdRef.current) return; // stale run
        if (msg.type === "progress") {
          setNodes(msg.nodes);
        } else if (msg.type === "solution") {
          for (const [k, letter] of Object.entries(msg.solution)) {
            let per = countsRef.current.get(k);
            if (!per) countsRef.current.set(k, (per = new Map()));
            per.set(letter, (per.get(letter) ?? 0) + 1);
          }
          setVariants(
            new Map(
              [...countsRef.current].map(([k, per]) => [k, new Map(per)]),
            ),
          );
          // Append without touching index: the author may be mid-cycle.
          setOptions((prev) => [...prev, msg.solution]);
          setNodes(msg.nodes);
        } else if (msg.type === "done") {
          setExhausted(msg.exhausted);
          setNodes(msg.nodes);
          setStatus("done");
        } else {
          setError(msg.message);
          setStatus("done");
        }
      };
      workerRef.current = w;
    }
    return workerRef.current;
  };
  useEffect(() => () => workerRef.current?.terminate(), []);

  // Anything for the fill to do? (An empty square that's part of a word.)
  const canStart = useMemo(
    () =>
      orderedStarts.some((s) =>
        slotCells(s).some((p) => !numbered[p.row][p.col].solution),
      ),
    [orderedStarts, numbered],
  );

  const start = useCallback(() => {
    const slots: SlotSpec[] = orderedStarts.map((s) => ({
      cells: slotCells(s).map((p) => ({
        key: keyOf(p.row, p.col),
        letters: numbered[p.row][p.col].solution ?? "",
      })),
      // A fully-typed selection carries no preference — there's nothing to
      // enumerate there and the worker ignores closed slots anyway.
      ...(activeSlot &&
      s.row === activeSlot.row &&
      s.col === activeSlot.col &&
      s.direction === activeSlot.direction
        ? { preferred: true }
        : {}),
    }));
    runIdRef.current++;
    setStatus("running");
    setOptions([]);
    setIndex(0);
    setNodes(0);
    setError(null);
    setExhausted(false);
    clearVariants();
    const req: FillRequest = {
      type: "fill",
      runId: runIdRef.current,
      wordlistUrl: import.meta.env.BASE_URL + "wordlist.txt",
      slots,
      nodeBudget: NODE_BUDGET,
      maxSolutions: SOLUTION_CAP,
      seed: Math.floor(Math.random() * 0x7fffffff),
    };
    ensureWorker().postMessage(req);
  }, [orderedStarts, numbered, activeSlot, clearVariants]);

  // Cancels a running search and drops any proposal (also the Cancel button).
  const dismiss = useCallback(() => {
    runIdRef.current++; // anything still in flight is stale now
    const cancel: WorkerRequest = { type: "cancel" };
    workerRef.current?.postMessage(cancel);
    setStatus("idle");
    setOptions([]);
    setIndex(0);
    setError(null);
    clearVariants();
  }, [clearVariants]);

  const cycle = useCallback(
    (delta: number) =>
      setIndex((i) =>
        options.length ? (i + delta + options.length) % options.length : 0,
      ),
    [options.length],
  );

  // Write the displayed proposal into the grid for real.
  const accept = useCallback(() => {
    const fill = options[index];
    if (!fill) return;
    const g = gridRef.current.map((row) => row.map((c) => ({ ...c })));
    for (const [k, letter] of Object.entries(fill)) {
      const [r, c] = k.split(",").map(Number);
      const cell = g[r]?.[c];
      if (cell && !cell.black && !cell.solution) cell.solution = letter;
    }
    // Accepting mid-search: stop the worker before its next solution lands.
    runIdRef.current++;
    const cancel: WorkerRequest = { type: "cancel" };
    workerRef.current?.postMessage(cancel);
    // Reset before the grid change lands so the edit-invalidation effect
    // below sees an idle state and leaves it alone.
    setStatus("idle");
    setOptions([]);
    setIndex(0);
    clearVariants();
    setGrid(g);
  }, [options, index, gridRef, setGrid, clearVariants]);

  // Grid edits invalidate the search/proposal (skip the mount-time run).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (statusRef.current !== "idle") dismiss();
  }, [numbered, dismiss]);

  // The displayed option as a cellKey -> letter map for the ghost overlay
  // (shown as soon as the first fill streams in, even mid-search).
  const proposal = useMemo<Map<string, string> | null>(() => {
    const fill = options[index];
    return fill ? new Map(Object.entries(fill)) : null;
  }, [options, index]);

  return {
    status,
    count: options.length,
    index,
    nodes,
    exhausted,
    error,
    proposal,
    variants,
    canStart,
    start,
    dismiss,
    cycle,
    accept,
  };
}

export type Autofill = ReturnType<typeof useAutofill>;
