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
//
// Until the first fill is found the budget is spent in slices with a restart
// between them: one unlucky early word choice can bury the search in a dead
// subtree for the entire budget, so each empty-handed slice reshuffles the
// candidate order and starts over from a different corner of the space.
// Restarts walk the same state space in a different order, so subtrees a
// previous attempt proved fill-less are remembered and skipped outright.

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

// How many candidates to count per slot when picking the next one to fill —
// only the relative order matters, so counting stops early.
const COUNT_CAP = 32;
// Yield to the event loop (cancel messages, progress) every this many words.
const YIELD_EVERY = 2048;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---- word list (fetched once, kept across runs) ---------------------------
// Every entry is fair game for the fill: the list is already culled to
// fill-quality words at build time (see scripts/build-wordlist.ts).

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
      buckets.set(len, arr);
      for (const s of arr) words.add(s.word);
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
  /** Fill this slot first (the author's selected word), so the options
   *  enumerate words for it. Only ever open at the root: choosing it there
   *  binds all its cells, and deeper picks fall back to most-constrained. */
  preferred: boolean;
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
    else
      model.push({
        len: fixed.length,
        fixed,
        cellAt,
        cells,
        preferred: !!s.preferred,
      });
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

  // Candidate order for the current attempt: best score first, seeded shuffle
  // within a score band. Views are built lazily per length actually searched,
  // and rebuilt under a new sub-seed on every restart.
  let orderSeed = req.seed;
  const ordered = new Map<number, Suggestion[]>();
  const bucketOf = (len: number): Suggestion[] => {
    let arr = ordered.get(len);
    if (!arr) {
      arr = [...(buckets.get(len) ?? [])].sort(
        (a, b) =>
          b.score - a.score || wordHash(a.word, orderSeed) - wordHash(b.word, orderSeed),
      );
      ordered.set(len, arr);
    }
    return arr;
  };

  // Per (position, letter) views of each ordered bucket, so a slot with any
  // known letter only tests words sharing it instead of the whole length
  // bucket. Built with (and cleared with) the ordered buckets, whose order
  // the views inherit.
  const byPosLetter = new Map<number, Map<number, Suggestion[]>>();
  const indexOf = (len: number): Map<number, Suggestion[]> => {
    let idx = byPosLetter.get(len);
    if (!idx) {
      idx = new Map();
      for (const s of bucketOf(len)) {
        for (let i = 0; i < s.word.length; i++) {
          const k = i * 26 + (s.word.charCodeAt(i) - 65);
          let arr = idx.get(k);
          if (!arr) idx.set(k, (arr = []));
          arr.push(s);
        }
      }
      byPosLetter.set(len, idx);
    }
    return idx;
  };

  const NONE: Suggestion[] = [];
  /** Words worth testing against a slot: the smallest per-letter view among
   *  its known positions, or the whole bucket when every cell is open. */
  const candidatesFor = (slot: Slot, pat: string): Suggestion[] => {
    let best: Suggestion[] | null = null;
    for (let i = 0; i < pat.length; i++) {
      const code = pat.charCodeAt(i) - 65;
      if (code < 0 || code >= 26) continue; // "." — open position
      const arr = indexOf(slot.len).get(i * 26 + code) ?? NONE;
      if (!best || arr.length < best.length) best = arr;
    }
    return best ?? bucketOf(slot.len);
  };

  const assign = new Map<string, string>();
  // Candidate counts per pattern string. Deliberately ignores the used-words
  // set, so entries stay valid as words bind and unbind while backtracking
  // (a count of 0 is then a safe prune: no word fits, used or not).
  const counts = new Map<string, number>();
  let nodes = 0;
  let solutions = 0;
  // While no fill has been found, each attempt only gets a slice of the
  // budget before a restart; after the first fill the run keeps its shuffle
  // and the full budget, enumerating options exactly as before.
  const slice = Math.max(1, req.nodeBudget >> 3);
  let sliceEnd = 0;
  const nodeLimit = () => (solutions > 0 ? req.nodeBudget : sliceEnd);

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

  const countFor = (slot: Slot, pat: string): number => {
    const hit = counts.get(pat);
    if (hit !== undefined) return hit;
    let n = 0;
    for (const s of candidatesFor(slot, pat)) {
      if (matches(slot, s.word) && ++n >= COUNT_CAP) break;
    }
    if (counts.size > 60_000) counts.clear();
    counts.set(pat, n);
    return n;
  };

  // Assignments proven to admit no fill, keyed by the concatenated slot
  // patterns (a canonical form of the whole grid state). Restarts revisit
  // exactly the states an earlier attempt saw — only the order differs — so
  // a subtree one attempt exhausted never needs searching again. Sound
  // because equal assignments imply equal used-word sets: the slot filled at
  // each state is a deterministic function of the state.
  const deadStates = new Set<string>();
  // Subtrees cheaper than this many nodes aren't worth a cache slot — they
  // cost less to re-derive than to remember.
  const DEAD_MIN_NODES = 64;

  /** "sol": a fill was streamed from somewhere below (unwind to the root
   *  choice); "dead": this subtree holds no fill; "stop": budget/cancel. */
  const dfs = async (depth: number): Promise<"sol" | "dead" | "stop"> => {
    // Pick the open slot with the fewest candidates; a slot completed by
    // crossing words must itself be a real word or the branch dies here.
    // The loop also concatenates every slot's pattern into the state key
    // for the dead-subtree cache.
    let best: Slot | null = null;
    let bestPat = "";
    let bestCount = Infinity;
    let key = "";
    for (const slot of model) {
      const pat = patternOf(slot);
      key += pat;
      let open = false;
      for (const k of slot.cells) {
        if (!assign.has(k)) {
          open = true;
          break;
        }
      }
      if (!open) {
        if (!words.has(pat)) return "dead";
        continue;
      }
      const n = countFor(slot, pat);
      if (n === 0) return "dead";
      if (n < bestCount || slot.preferred) {
        bestCount = n;
        best = slot;
        bestPat = pat;
        // The author's word wins the root pick outright — later slots must
        // not displace it, and its own count no longer matters.
        if (slot.preferred) bestCount = -Infinity;
      }
    }
    if (!best) {
      solutions++;
      ctx.postMessage({
        type: "solution",
        runId: req.runId,
        solution: Object.fromEntries(assign),
        nodes,
      });
      return "sol";
    }
    if (deadStates.has(key)) return "dead";

    const entered = nodes;
    for (const s of candidatesFor(best, bestPat)) {
      if (used.has(s.word) || !matches(best, s.word)) continue;
      if (++nodes >= nodeLimit()) return "stop";
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
    if (nodes - entered >= DEAD_MIN_NODES) {
      if (deadStates.size > 50_000) deadStates.clear();
      deadStates.add(key);
    }
    return "dead";
  };

  // Restart loop. Every dfs unwind restores assign/used completely (cleanup
  // precedes each early return), so an attempt can start fresh by just
  // reshuffling; the pattern-count cache is order-independent and kept.
  let r: "sol" | "dead" | "stop";
  for (let attempt = 1; ; attempt++) {
    sliceEnd = Math.min(nodes + slice, req.nodeBudget);
    r = await dfs(0);
    if (r !== "stop" || token.cancelled || solutions > 0 || nodes >= req.nodeBudget)
      break;
    orderSeed = (req.seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0;
    ordered.clear();
    byPosLetter.clear();
  }
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
