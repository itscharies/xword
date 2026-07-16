// Message protocol between the builder's useAutofill hook (main thread) and
// workers/fill.worker.ts (the background fill search).

/** One cell of a slot: its "r,c" key and its current content — "" when empty
 *  (a square the fill should complete), one letter when typed, or the full
 *  multi-letter string for a rebus square (a fixed run of letters). */
export interface FillCellSpec {
  key: string;
  letters: string;
}

/** A slot (an across or down word) as its ordered cells. */
export interface SlotSpec {
  cells: FillCellSpec[];
}

export interface FillRequest {
  type: "fill";
  runId: number;
  wordlistUrl: string;
  slots: SlotSpec[];
  /** Abandon the search after trying this many words (bounds CPU time). */
  nodeBudget: number;
  /** Tie-break seed: words of equal score are tried in a per-run shuffled
   *  order (STWL scores are coarse bands, so a stable sort would otherwise
   *  walk ties alphabetically and every fill would start with AA-words).
   *  Restarts inside a run reshuffle under sub-seeds derived from this. */
  seed: number;
}

export type WorkerRequest = FillRequest | { type: "cancel" };

/** A complete fill: one letter for every empty cell, keyed "r,c". */
export type FillSolution = Record<string, string>;

export type FillResponse =
  | { type: "progress"; runId: number; nodes: number }
  /** Fills stream back one at a time, as the search finds them. */
  | { type: "solution"; runId: number; solution: FillSolution; nodes: number }
  | {
      type: "done";
      runId: number;
      /** True when the whole search space was covered (a "no fill" is then
       *  definitive, not just a budget timeout). */
      exhausted: boolean;
      nodes: number;
    }
  | { type: "error"; runId: number; message: string };
