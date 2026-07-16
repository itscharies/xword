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
// giving up. There's no cap on fills — every one found streams into the list.
const NODE_BUDGET = 500_000;

const keyOf = (r: number, c: number) => `${r},${c}`;

export interface AutofillDeps {
  numbered: Cell[][];
  orderedStarts: WordStart[];
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
export function useAutofill({ numbered, orderedStarts, gridRef, setGrid }: AutofillDeps) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [options, setOptions] = useState<FillSolution[]>([]);
  const [index, setIndex] = useState(0);
  const [nodes, setNodes] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cells whose letter differs somewhere across the found fills — the grid
  // marks these on the ghost so the author can see where the fill branches
  // (an unmarked ghost letter is the same in every option found so far).
  const [branchCells, setBranchCells] = useState<Set<string>>(new Set());

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  // Incremental branch tracking: the first letter each cell was seen with,
  // and the cells already known to vary. O(cells) per streamed solution.
  const firstLetterRef = useRef(new Map<string, string>());
  const branchRef = useRef(new Set<string>());

  const clearBranches = useCallback(() => {
    firstLetterRef.current = new Map();
    branchRef.current = new Set();
    setBranchCells(new Set());
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
          let grew = false;
          for (const [k, letter] of Object.entries(msg.solution)) {
            if (branchRef.current.has(k)) continue;
            const first = firstLetterRef.current.get(k);
            if (first === undefined) firstLetterRef.current.set(k, letter);
            else if (first !== letter) {
              branchRef.current.add(k);
              grew = true;
            }
          }
          if (grew) setBranchCells(new Set(branchRef.current));
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
    }));
    runIdRef.current++;
    setStatus("running");
    setOptions([]);
    setIndex(0);
    setNodes(0);
    setError(null);
    setExhausted(false);
    clearBranches();
    const req: FillRequest = {
      type: "fill",
      runId: runIdRef.current,
      wordlistUrl: import.meta.env.BASE_URL + "wordlist.txt",
      slots,
      nodeBudget: NODE_BUDGET,
      seed: Math.floor(Math.random() * 0x7fffffff),
    };
    ensureWorker().postMessage(req);
  }, [orderedStarts, numbered, clearBranches]);

  // Cancels a running search and drops any proposal (also the Cancel button).
  const dismiss = useCallback(() => {
    runIdRef.current++; // anything still in flight is stale now
    const cancel: WorkerRequest = { type: "cancel" };
    workerRef.current?.postMessage(cancel);
    setStatus("idle");
    setOptions([]);
    setIndex(0);
    setError(null);
    clearBranches();
  }, [clearBranches]);

  const cycle = useCallback(
    (delta: number) =>
      setIndex((i) =>
        options.length ? (i + delta + options.length) % options.length : 0,
      ),
    [options.length],
  );

  // Jump to the next option that fills any of `cellKeys` differently — the
  // "show me another word here" cycle for the slot under the cursor.
  const cycleAt = useCallback(
    (cellKeys: string[]) => {
      const cur = options[index];
      if (!cur) return;
      for (let step = 1; step < options.length; step++) {
        const j = (index + step) % options.length;
        if (cellKeys.some((k) => options[j][k] !== cur[k])) {
          setIndex(j);
          return;
        }
      }
    },
    [options, index],
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
    clearBranches();
    setGrid(g);
  }, [options, index, gridRef, setGrid, clearBranches]);

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
    branchCells,
    canStart,
    start,
    dismiss,
    cycle,
    cycleAt,
    accept,
  };
}

export type Autofill = ReturnType<typeof useAutofill>;
