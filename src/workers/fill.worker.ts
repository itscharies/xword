// Autofill search for the /create builder. Runs off the main thread so the
// backtracking never blocks typing, and yields to the event loop between
// batches so a "cancel" (or a superseding "fill") can interrupt mid-search.
//
// The algorithm is a classic constraint fill: repeatedly take the unfilled
// slot with the fewest matching words (most-constrained-first), try its
// candidates in score order so strong words surface, and backtrack on dead
// ends. Each complete fill is streamed back the moment it's found, then the
// search unwinds to its first choice point and keeps going until the word
// list or the node budget runs out — so the options differ in a whole word
// choice rather than in one corner cell, and the list grows as long as the
// search keeps producing.

import { parseWordlist, type Suggestion } from "../lib/wordlist.ts";
import type {
  FillRequest,
  FillResponse,
  SlotSpec,
  WorkerRequest,
} from "../lib/autofill.ts";

// Typed by hand so this file doesn't need the WebWorker lib alongside DOM.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: FillResponse) => void;
};

// STWL scores run 0–50 in coarse bands, and the low bands hide outright junk
// ("UOYRO;20") next to merely-weak entries. Autofill only places words at or
// above this bar; the suggestions panel and the unknown-word highlight keep
// the full list, so hand-placed oddballs stay allowed.
const MIN_SCORE = 25;
// How many candidates to count per slot when picking the next one to fill —
// only the relative order matters, so counting stops early.
const COUNT_CAP = 32;
// Yield to the event loop (cancel messages, progress) every this many words.
const YIELD_EVERY = 2048;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---- word list (fetched once, kept across runs) ---------------------------

let buckets: Map<number, Suggestion[]> | null = null;
let words: Set<string> | null = null;
let loadedFrom = "";

async function ensureWordlist(url: string) {
  if (!buckets || !words || loadedFrom !== url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`wordlist ${r.status}`);
    buckets = new Map();
    words = new Set<string>();
    for (const [len, arr] of parseWordlist(await r.text())) {
      const good = arr.filter((s) => s.score >= MIN_SCORE);
      if (good.length) buckets.set(len, good);
      for (const s of good) words.add(s.word);
    }
    loadedFrom = url;
  }
  return { buckets, words };
}

// ---- grid model ------------------------------------------------------------

/** A slot flattened to letter positions (rebus cells span several). */
interface Slot {
  len: number;
  /** Fixed letter per position, null where the cell is open. */
  fixed: (string | null)[];
  /** Open cell key per position, null where the letter is fixed. */
  cellAt: (string | null)[];
  /** The open cell keys, deduped, in order. */
  cells: string[];
}

/** Compile slot specs into the search model. Slots with no open cells are the
 *  author's own words — untouchable, but reserved so the fill can't reuse
 *  them elsewhere. */
function compile(slots: SlotSpec[]): { model: Slot[]; used: Set<string> } {
  const model: Slot[] = [];
  const used = new Set<string>();
  for (const s of slots) {
    const fixed: (string | null)[] = [];
    const cellAt: (string | null)[] = [];
    const cells: string[] = [];
    for (const c of s.cells) {
      if (c.letters) {
        for (const ch of c.letters) {
          fixed.push(ch);
          cellAt.push(null);
        }
      } else {
        fixed.push(null);
        cellAt.push(c.key);
        cells.push(c.key);
      }
    }
    if (cells.length === 0) used.add(fixed.join(""));
    else model.push({ len: fixed.length, fixed, cellAt, cells });
  }
  return { model, used };
}

// ---- search ----------------------------------------------------------------

interface RunToken {
  cancelled: boolean;
}

// FNV-1a-style word hash, mixed with the run seed — the equal-score
// tie-breaker for candidate order.
function wordHash(word: string, seed: number): number {
  let h = (seed ^ 2166136261) >>> 0;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function search(
  req: FillRequest,
  token: RunToken,
): Promise<{ exhausted: boolean; nodes: number }> {
  const { buckets, words } = await ensureWordlist(req.wordlistUrl);
  const { model, used } = compile(req.slots);

  // Candidate order for this run: best score first, seeded shuffle within a
  // score band. Views are built lazily per length actually searched.
  const ordered = new Map<number, Suggestion[]>();
  const bucketOf = (len: number): Suggestion[] => {
    let arr = ordered.get(len);
    if (!arr) {
      arr = [...(buckets.get(len) ?? [])].sort(
        (a, b) =>
          b.score - a.score || wordHash(a.word, req.seed) - wordHash(b.word, req.seed),
      );
      ordered.set(len, arr);
    }
    return arr;
  };

  const assign = new Map<string, string>();
  // Candidate counts per pattern string. Deliberately ignores the used-words
  // set, so entries stay valid as words bind and unbind while backtracking
  // (a count of 0 is then a safe prune: no word fits, used or not).
  const counts = new Map<string, number>();
  let nodes = 0;

  const patternOf = (slot: Slot): string => {
    let p = "";
    for (let i = 0; i < slot.len; i++)
      p += slot.fixed[i] ?? assign.get(slot.cellAt[i]!) ?? ".";
    return p;
  };

  const matches = (slot: Slot, word: string): boolean => {
    for (let i = 0; i < slot.len; i++) {
      const want = slot.fixed[i] ?? assign.get(slot.cellAt[i]!);
      if (want !== undefined && word[i] !== want) return false;
    }
    return true;
  };

  const countFor = (slot: Slot): number => {
    const pat = patternOf(slot);
    const hit = counts.get(pat);
    if (hit !== undefined) return hit;
    let n = 0;
    for (const s of bucketOf(slot.len)) {
      if (matches(slot, s.word) && ++n >= COUNT_CAP) break;
    }
    if (counts.size > 60_000) counts.clear();
    counts.set(pat, n);
    return n;
  };

  /** "sol": a fill was streamed from somewhere below (unwind to the root
   *  choice); "dead": this subtree holds no fill; "stop": budget/cancel. */
  const dfs = async (depth: number): Promise<"sol" | "dead" | "stop"> => {
    // Pick the open slot with the fewest candidates; a slot completed by
    // crossing words must itself be a real word or the branch dies here.
    let best: Slot | null = null;
    let bestCount = Infinity;
    for (const slot of model) {
      let open = false;
      for (const k of slot.cells) {
        if (!assign.has(k)) {
          open = true;
          break;
        }
      }
      if (!open) {
        if (!words.has(patternOf(slot))) return "dead";
        continue;
      }
      const n = countFor(slot);
      if (n === 0) return "dead";
      if (n < bestCount) {
        bestCount = n;
        best = slot;
      }
    }
    if (!best) {
      ctx.postMessage({
        type: "solution",
        runId: req.runId,
        solution: Object.fromEntries(assign),
        nodes,
      });
      return "sol";
    }

    for (const s of bucketOf(best.len)) {
      if (used.has(s.word) || !matches(best, s.word)) continue;
      if (++nodes >= req.nodeBudget) return "stop";
      if (nodes % YIELD_EVERY === 0) {
        ctx.postMessage({ type: "progress", runId: req.runId, nodes });
        await tick();
        if (token.cancelled) return "stop";
      }

      const bound: string[] = [];
      for (let i = 0; i < best.len; i++) {
        const k = best.cellAt[i];
        if (k && !assign.has(k)) {
          assign.set(k, s.word[i]);
          bound.push(k);
        }
      }
      used.add(s.word);
      const r = await dfs(depth + 1);
      used.delete(s.word);
      for (const k of bound) assign.delete(k);

      if (r === "stop") return "stop";
      // "sol": unwind to the root, where the next word is the next option.
      if (r === "sol" && depth > 0) return "sol";
    }
    return "dead";
  };

  const r = await dfs(0);
  return { exhausted: r !== "stop", nodes };
}

// ---- message loop ----------------------------------------------------------

// Runs are chained so a superseding "fill" waits for the cancelled one to
// notice its token and unwind, keeping the shared word list state single-file.
let current: RunToken = { cancelled: false };
let chain: Promise<void> = Promise.resolve();

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "cancel") {
    current.cancelled = true;
    return;
  }
  current.cancelled = true;
  const token: RunToken = { cancelled: false };
  current = token;
  chain = chain.then(async () => {
    try {
      const { exhausted, nodes } = await search(msg, token);
      if (token.cancelled) return;
      ctx.postMessage({ type: "done", runId: msg.runId, exhausted, nodes });
    } catch (err) {
      if (token.cancelled) return;
      ctx.postMessage({
        type: "error",
        runId: msg.runId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
