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

// Bounds on the background search: how many candidate words it may try
// before giving up, and how many alternative fills to bring back.
const NODE_BUDGET = 500_000;
const MAX_OPTIONS = 5;

const keyOf = (r: number, c: number) => `${r},${c}`;

export interface AutofillDeps {
  numbered: Cell[][];
  orderedStarts: WordStart[];
  gridRef: React.MutableRefObject<Cell[][]>;
  setGrid: (g: Cell[][]) => void;
}

/**
 * Background "fill it in for me" for the builder: ships the current slots to
 * a worker that searches the word list for complete fills, and holds the
 * returned options as a ghost proposal (letters overlaid on the grid) the
 * author can cycle through and accept. Any grid edit invalidates a running
 * search or pending proposal — it was computed against the old letters.
 */
export function useAutofill({ numbered, orderedStarts, gridRef, setGrid }: AutofillDeps) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [options, setOptions] = useState<FillSolution[]>([]);
  const [index, setIndex] = useState(0);
  const [nodes, setNodes] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

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
        } else if (msg.type === "result") {
          setOptions(msg.solutions);
          setIndex(0);
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
    const req: FillRequest = {
      type: "fill",
      runId: runIdRef.current,
      wordlistUrl: import.meta.env.BASE_URL + "wordlist.txt",
      slots,
      maxSolutions: MAX_OPTIONS,
      nodeBudget: NODE_BUDGET,
      seed: Math.floor(Math.random() * 0x7fffffff),
    };
    ensureWorker().postMessage(req);
  }, [orderedStarts, numbered]);

  // Cancels a running search and drops any proposal (also the Cancel button).
  const dismiss = useCallback(() => {
    runIdRef.current++; // anything still in flight is stale now
    const cancel: WorkerRequest = { type: "cancel" };
    workerRef.current?.postMessage(cancel);
    setStatus("idle");
    setOptions([]);
    setIndex(0);
    setError(null);
  }, []);

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
    // Reset before the grid change lands so the edit-invalidation effect
    // below sees an idle state and leaves it alone.
    setStatus("idle");
    setOptions([]);
    setIndex(0);
    setGrid(g);
  }, [options, index, gridRef, setGrid]);

  // Grid edits invalidate the search/proposal (skip the mount-time run).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (statusRef.current !== "idle") dismiss();
  }, [numbered, dismiss]);

  // The displayed option as a cellKey -> letter map for the ghost overlay.
  const proposal = useMemo<Map<string, string> | null>(() => {
    const fill = status === "done" ? options[index] : undefined;
    return fill ? new Map(Object.entries(fill)) : null;
  }, [status, options, index]);

  return {
    status,
    count: options.length,
    index,
    nodes,
    exhausted,
    error,
    proposal,
    canStart,
    start,
    dismiss,
    cycle,
    accept,
  };
}

export type Autofill = ReturnType<typeof useAutofill>;
