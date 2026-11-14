// The autofill search itself, free of any worker plumbing so it can be driven
// (and tested) from anywhere: workers/fill.worker.ts steps it in the
// background, yielding to the event loop between slices.
//
// It is a complete search — it only ever ends because the space is covered,
// the caller's solution cap is hit, or the caller stops stepping it. There is
// no work budget: a hard grid just takes longer.
//
// The pieces, roughly in order of how much they buy:
//
//  * Candidate sets. Every slot holds the exact set of words that still fit
//    it. While that set is large it's a bitset over the length bucket, with
//    a prebuilt bitset per (position, letter): narrowing is a word-wise AND
//    and counting is a popcount. Once it's small it becomes a plain list of
//    word ids, so the cost of touching a slot tracks how many candidates it
//    has left — and deep in the search, where nearly all the work happens,
//    that's a handful.
//
//  * Arc consistency. Every open cell holds the letters both of its words can
//    still supply. Placing a word narrows its cells, which narrows the
//    crossing slots, which narrows *their* other cells, and so on to a fixed
//    point. A dead end several words away is seen the moment it becomes
//    inevitable instead of when the search finally walks into it — and a grid
//    whose constraints are already contradictory is refuted before a single
//    word is tried.
//
//  * Most-constrained-first. The next slot filled is the one with the fewest
//    remaining candidates (exact, thanks to the bitsets).
//
//  * Conflict-directed backjumping. Each slot and cell remembers which
//    earlier choices narrowed it. When a branch dies, the failure names the
//    choices that caused it; a choice the failure doesn't name can't fix it,
//    so the search skips straight back over it rather than re-trying every
//    alternative there. This is what makes the starting slot stop mattering:
//    an impossible corner is no longer re-proved once per word of an
//    unrelated first slot.
//
//  * Dead-state memory. A grid state proven fill-less is remembered and never
//    searched again — by a later branch that reaches the same letters, or by
//    a restart.
//
//  * Restarts. Until the first fill, each attempt gets a slice of work, then
//    the tie-break order is reshuffled and the search starts over (keeping
//    its dead states), so one unlucky early word can't bury it. Slices double
//    each time, so some attempt is eventually long enough to cover the whole
//    space — restarting never costs completeness.
//
// Each complete fill is handed to onSolution the moment it's found, then the
// search unwinds to its first choice and tries the next word there — so the
// options differ in a whole word rather than in one corner cell. From then
// on each first word gets a slice of work of its own: one that hasn't
// produced a fill (or been ruled out) within it is set aside and the next is
// tried, so one stubborn word can't hold up the rest of the options. The
// ones set aside come round again with double the slice, until every first
// word has either yielded a fill or been proven to have none.

import type { Suggestion } from "./wordlist.ts";
import type { FillSolution, SlotSpec } from "./autofill.ts";

export interface FillSearchOptions {
  slots: SlotSpec[];
  /** Tie-break seed: words of equal score are tried in a seeded shuffled
   *  order (STWL scores are coarse bands, so a stable sort would otherwise
   *  walk ties alphabetically). Restarts reshuffle under derived sub-seeds. */
  seed: number;
  /** Stop after this many fills. */
  maxSolutions: number;
  onSolution: (solution: FillSolution, nodes: number) => void;
  /** Hand control back (a generator yield) about this often. Default 100. */
  yieldMs?: number;
  /** Tests only: false turns backjumping off (plain chronological
   *  backtracking), to check the two agree. */
  backjump?: boolean;
}

export interface FillSearchResult {
  /** True when the whole space was covered: with no fills found that makes
   *  "no fill exists" definitive. False only when the solution cap ended it. */
  exhausted: boolean;
  /** Words tried. */
  nodes: number;
}

const ALL_LETTERS = 0x3ffffff;
// Work allowed to the first attempt; each restart doubles it.
const FIRST_SLICE = 2048;
// Once fills are flowing: work allowed to each first word before it's set
// aside for a later, longer pass.
const OPTION_SLICE = 4096;
// Subtrees cheaper than this many words aren't worth remembering as dead.
const DEAD_MIN_NODES = 16;
const DEAD_CAP = 100_000;

const DEAD = 0;
const SOL = 1;
const STOP = 2;
type Outcome = typeof DEAD | typeof SOL | typeof STOP;

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

// FNV-1a-style word hash mixed with the seed: the equal-score tie-breaker.
function wordHash(word: string, seed: number): number {
  let h = (seed ^ 2166136261) >>> 0;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One length bucket, indexed for the search. Word ids follow the candidate
 *  order (best score first, seeded shuffle within a band), so walking a
 *  bitset's set bits upward tries the strongest words first. */
class LengthIndex {
  readonly len: number;
  readonly n: number;
  /** Uint32 words per bitset. */
  readonly nw: number;
  words: string[] = [];
  /** Letter code (0–25) of word id at pos: codes[id * len + pos]. */
  readonly codes: Uint8Array;
  /** Bitset of the words with a given letter at a given position, at
   *  [pos * 26 + letter]; null where no word has it. */
  readonly posLetter: (Uint32Array | null)[];
  private readonly source: Suggestion[];
  private readonly pool: Uint32Array[] = [];

  constructor(len: number, source: Suggestion[]) {
    this.len = len;
    this.source = source;
    this.n = source.length;
    this.nw = Math.ceil(this.n / 32);
    this.codes = new Uint8Array(this.n * len);
    this.posLetter = new Array(len * 26).fill(null);
  }

  /** (Re)build the index under a tie-break seed. */
  reorder(seed: number) {
    const { source, len, n } = this;
    const keys = new Float64Array(n);
    const order = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      keys[i] = -source[i].score * 4294967296 + wordHash(source[i].word, seed);
      order[i] = i;
    }
    order.sort((a, b) => keys[a] - keys[b]);
    this.words = order.map((i) => source[i].word);
    for (const b of this.posLetter) b?.fill(0);
    for (let id = 0; id < n; id++) {
      const w = this.words[id];
      for (let p = 0; p < len; p++) {
        const code = w.charCodeAt(p) - 65;
        this.codes[id * len + p] = code;
        const k = p * 26 + code;
        let bits = this.posLetter[k];
        if (!bits) bits = this.posLetter[k] = new Uint32Array(this.nw);
        bits[id >>> 5] |= 1 << (id & 31);
      }
    }
  }

  alloc(): Uint32Array {
    return this.pool.pop() ?? new Uint32Array(this.nw);
  }
  release(b: Uint32Array) {
    this.pool.push(b);
  }
}

/** A slot flattened to letter positions (rebus cells span several). */
interface Slot {
  len: number;
  index: LengthIndex | null;
  /** Fixed letter code per position, -1 where the cell is open. */
  fixed: number[];
  /** Open cell index per position, -1 where the letter is fixed. */
  cellAt: number[];
  /** The author's selected word: filled first, so the options enumerate
   *  words for it. */
  preferred: boolean;
}

/**
 * Search for complete fills. A generator so the caller owns the scheduling:
 * each `next()` runs about `yieldMs` of search and yields the words tried so
 * far; the return value arrives when the search is over. To cancel, just
 * stop calling `next()`.
 */
export function* fillSearch(
  buckets: Map<number, Suggestion[]>,
  opts: FillSearchOptions,
): Generator<number, FillSearchResult, void> {
  const yieldMs = opts.yieldMs ?? 100;

  // ---- compile the grid ----------------------------------------------------
  // Slots with no open cells are the author's own words: untouchable, but
  // reserved so the fill can't reuse them elsewhere.
  const cellIndex = new Map<string, number>();
  const cellKeys: string[] = [];
  const slots: Slot[] = [];
  const authorWords = new Set<string>();
  const indexes = new Map<number, LengthIndex>();
  for (const spec of opts.slots) {
    const fixed: number[] = [];
    const cellAt: number[] = [];
    let open = false;
    let text = "";
    for (const c of spec.cells) {
      if (c.letters) {
        text += c.letters;
        for (let i = 0; i < c.letters.length; i++) {
          fixed.push(c.letters.charCodeAt(i) - 65);
          cellAt.push(-1);
        }
      } else {
        let ci = cellIndex.get(c.key);
        if (ci === undefined) {
          ci = cellKeys.length;
          cellIndex.set(c.key, ci);
          cellKeys.push(c.key);
        }
        fixed.push(-1);
        cellAt.push(ci);
        open = true;
      }
    }
    if (!open) {
      authorWords.add(text);
      continue;
    }
    const len = fixed.length;
    let index = indexes.get(len) ?? null;
    const source = buckets.get(len);
    if (!index && source?.length) {
      index = new LengthIndex(len, source);
      indexes.set(len, index);
    }
    slots.push({ len, index, fixed, cellAt, preferred: !!spec.preferred });
  }
  const nSlots = slots.length;
  const nCells = cellKeys.length;
  // No word list for some slot's length: nothing can ever fit it.
  if (slots.some((s) => !s.index)) return { exhausted: true, nodes: 0 };

  /** Per cell, its (slot, position) memberships, flattened in pairs. */
  const cellSlots: number[][] = cellKeys.map(() => []);
  slots.forEach((s, si) =>
    s.cellAt.forEach((ci, pos) => {
      if (ci >= 0) cellSlots[ci].push(si, pos);
    }),
  );

  // ---- search state --------------------------------------------------------
  // "Why" sets are bitsets of decision depths: for a slot, the choices that
  // removed candidates from it; for a cell, the choices that removed letters.
  const W = Math.ceil((nSlots + 1) / 32);
  // A slot's candidates: a bitset over its length bucket, or — once there
  // are few enough to fit (count <= nw) — the word ids themselves, ascending,
  // in the first `count` entries of an array of the same size.
  const cand: Uint32Array[] = new Array(nSlots);
  const isList = new Uint8Array(nSlots);
  const count = new Int32Array(nSlots);
  const mask = new Int32Array(nCells);
  const slotWhy = new Uint32Array(nSlots * W);
  const cellWhy = new Uint32Array(nCells * W);
  /** The choices behind the most recent dead end. */
  const conflict = new Uint32Array(W);

  // Undo trail: a slot or cell is saved the first time it changes after a
  // mark, and restored when the search backs up past that mark.
  let recording = false;
  let stamp = 0;
  // (Float64: a long search outruns 32 bits of stamps.)
  const slotStamp = new Float64Array(nSlots).fill(-1);
  const cellStamp = new Float64Array(nCells).fill(-1);
  const tIsSlot: boolean[] = [];
  const tList: number[] = [];
  const tIdx: number[] = [];
  const tNum: number[] = [];
  const tBits: (Uint32Array | null)[] = [];
  const tWhy: number[] = [];

  /** Save slot s ahead of a change. The saved copy is the slot's own array,
   *  moved onto the trail: the slot gets a fresh one, into which the caller
   *  must write the new contents (`copy` pre-fills it with the old). Returns
   *  the array to read the old contents from — the same one when the slot was
   *  already saved under this mark and is being changed in place. */
  const saveSlot = (s: number, copy: boolean): Uint32Array => {
    const old = cand[s];
    if (!recording || slotStamp[s] === stamp) return old;
    slotStamp[s] = stamp;
    tIsSlot.push(true);
    tList.push(isList[s]);
    tIdx.push(s);
    tNum.push(count[s]);
    tBits.push(old);
    for (let i = 0; i < W; i++) tWhy.push(slotWhy[s * W + i]);
    const fresh = (cand[s] = slots[s].index!.alloc());
    if (copy) fresh.set(old);
    return old;
  };
  const saveCell = (c: number) => {
    if (!recording || cellStamp[c] === stamp) return;
    cellStamp[c] = stamp;
    tIsSlot.push(false);
    tList.push(0);
    tIdx.push(c);
    tNum.push(mask[c]);
    tBits.push(null);
    for (let i = 0; i < W; i++) tWhy.push(cellWhy[c * W + i]);
  };
  const undoTo = (mark: number) => {
    while (tIdx.length > mark) {
      const idx = tIdx.pop()!;
      const num = tNum.pop()!;
      const bits = tBits.pop()!;
      const list = tList.pop()!;
      if (tIsSlot.pop()) {
        slots[idx].index!.release(cand[idx]);
        cand[idx] = bits!;
        isList[idx] = list;
        count[idx] = num;
        for (let i = W - 1; i >= 0; i--) slotWhy[idx * W + i] = tWhy.pop()!;
      } else {
        mask[idx] = num;
        for (let i = W - 1; i >= 0; i--) cellWhy[idx * W + i] = tWhy.pop()!;
      }
    }
    // Anything saved under an undone mark must be saved afresh next time.
    stamp++;
  };

  // ---- propagation ---------------------------------------------------------
  const queue = new Int32Array(nCells);
  let qLen = 0;
  const queued = new Uint8Array(nCells);
  const enqueue = (c: number) => {
    if (!queued[c]) {
      queued[c] = 1;
      queue[qLen++] = c;
    }
  };
  let scratch = new Uint32Array(0);

  /** Turn slot s's bitset into an id list once it's small enough to fit. */
  const compact = (s: number) => {
    const ix = slots[s].index!;
    if (isList[s] || count[s] > ix.nw) return;
    const bits = cand[s];
    const list = ix.alloc();
    let n = 0;
    for (let i = 0; i < ix.nw; i++) {
      let x = bits[i];
      while (x) {
        const b = x & -x;
        x ^= b;
        list[n++] = i * 32 + (31 - Math.clz32(b));
      }
    }
    ix.release(bits);
    cand[s] = list;
    isList[s] = 1;
  };

  /** Drop slot t's candidates whose letter at `pos` isn't in `m`. */
  const filterSlot = (t: number, pos: number, m: number): boolean => {
    const slot = slots[t];
    const ix = slot.index!;
    const nw = ix.nw;
    if (isList[t]) {
      const len = slot.len;
      const n = count[t];
      const codes = ix.codes;
      let src = cand[t];
      let j = 0;
      while (j < n && (m >>> codes[src[j] * len + pos]) & 1) j++;
      if (j === n) return false;
      src = saveSlot(t, false);
      const dst = cand[t];
      if (dst !== src) for (let i = 0; i < j; i++) dst[i] = src[i];
      let kept = j;
      for (let i = j + 1; i < n; i++) {
        const id = src[i];
        if ((m >>> codes[id * len + pos]) & 1) dst[kept++] = id;
      }
      count[t] = kept;
      return true;
    }
    const bits = cand[t];
    const k = popcount(m);
    let allowed: Uint32Array;
    let invert = false;
    if (k === 1) {
      const one = ix.posLetter[pos * 26 + (31 - Math.clz32(m))];
      if (!one) {
        saveSlot(t, false);
        count[t] = 0;
        return true;
      }
      allowed = one;
    } else {
      // Union the smaller side: the allowed letters, or the excluded ones
      // (every word has exactly one letter here, so the two partition it).
      invert = k > 13;
      let letters = invert ? ~m & ALL_LETTERS : m;
      if (scratch.length < nw) scratch = new Uint32Array(nw);
      scratch.fill(0, 0, nw);
      while (letters) {
        const b = letters & -letters;
        letters ^= b;
        const src = ix.posLetter[pos * 26 + (31 - Math.clz32(b))];
        if (src) for (let i = 0; i < nw; i++) scratch[i] |= src[i];
      }
      allowed = scratch;
    }
    let changed = false;
    for (let i = 0; i < nw; i++) {
      if (bits[i] & ~(invert ? ~allowed[i] : allowed[i])) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    saveSlot(t, false);
    const live = cand[t];
    let n = 0;
    for (let i = 0; i < nw; i++) {
      const v = bits[i] & (invert ? ~allowed[i] : allowed[i]);
      live[i] = v;
      n += popcount(v);
    }
    count[t] = n;
    compact(t);
    return true;
  };

  /** Of the letters in `want`, those some candidate of slot t has at `pos`. */
  const supported = (t: number, pos: number, want: number): number => {
    const slot = slots[t];
    const ix = slot.index!;
    const bits = cand[t];
    const nw = ix.nw;
    let sup = 0;
    if (isList[t]) {
      const len = slot.len;
      const n = count[t];
      for (let i = 0; i < n; i++) {
        sup |= 1 << ix.codes[bits[i] * len + pos];
        if ((sup & want) === want) return want;
      }
      return sup & want;
    }
    let letters = want;
    while (letters) {
      const b = letters & -letters;
      letters ^= b;
      const src = ix.posLetter[pos * 26 + (31 - Math.clz32(b))];
      if (!src) continue;
      for (let i = 0; i < nw; i++) {
        if (bits[i] & src[i]) {
          sup |= b;
          break;
        }
      }
    }
    return sup;
  };

  /** Re-derive the letters slot t supports in its open cells (all but
   *  `skip`), narrowing them. False on an emptied cell, with `conflict` set. */
  const narrowCells = (t: number, skip: number): boolean => {
    const slot = slots[t];
    for (let p = 0; p < slot.len; p++) {
      const c = slot.cellAt[p];
      if (c < 0 || c === skip) continue;
      const m = mask[c];
      const nm = supported(t, p, m);
      if (nm === m) continue;
      saveCell(c);
      mask[c] = nm;
      for (let i = 0; i < W; i++) cellWhy[c * W + i] |= slotWhy[t * W + i];
      if (nm === 0) {
        for (let i = 0; i < W; i++) conflict[i] = cellWhy[c * W + i];
        return false;
      }
      enqueue(c);
    }
    return true;
  };

  /** Run the queue to a fixed point. False on a dead end, with `conflict`
   *  naming the choices that led to it. */
  const propagate = (): boolean => {
    let ok = true;
    while (qLen > 0) {
      const c = queue[--qLen];
      queued[c] = 0;
      if (!ok) continue; // just draining
      const memberships = cellSlots[c];
      for (let j = 0; j < memberships.length && ok; j += 2) {
        const t = memberships[j];
        if (!filterSlot(t, memberships[j + 1], mask[c])) continue;
        for (let i = 0; i < W; i++) slotWhy[t * W + i] |= cellWhy[c * W + i];
        if (count[t] === 0) {
          for (let i = 0; i < W; i++) conflict[i] = slotWhy[t * W + i];
          ok = false;
        } else {
          ok = narrowCells(t, c);
        }
      }
    }
    return ok;
  };

  /** Set up a fresh attempt: every slot's candidates from its fixed letters,
   *  every cell wide open, then propagated. False if already contradictory. */
  const init = (seed: number): boolean => {
    recording = false;
    undoTo(0);
    for (const ix of indexes.values()) ix.reorder(seed);
    slotWhy.fill(0);
    cellWhy.fill(0);
    mask.fill(ALL_LETTERS);
    for (let s = 0; s < nSlots; s++) {
      const slot = slots[s];
      const ix = slot.index!;
      if (cand[s]) ix.release(cand[s]);
      const bits = (cand[s] = ix.alloc());
      isList[s] = 0;
      bits.fill(0xffffffff);
      if (ix.n & 31) bits[ix.nw - 1] = (1 << (ix.n & 31)) - 1;
      for (let p = 0; p < slot.len; p++) {
        if (slot.fixed[p] < 0) continue;
        const src = ix.posLetter[p * 26 + slot.fixed[p]];
        for (let i = 0; i < ix.nw; i++) bits[i] &= src ? src[i] : 0;
      }
    }
    for (const w of authorWords) {
      const ix = indexes.get(w.length);
      const id = ix ? ix.words.indexOf(w) : -1;
      if (id < 0) continue;
      for (let s = 0; s < nSlots; s++)
        if (slots[s].index === ix) cand[s][id >>> 5] &= ~(1 << (id & 31));
    }
    let ok = true;
    for (let s = 0; s < nSlots; s++) {
      const bits = cand[s];
      let n = 0;
      for (let i = 0; i < bits.length; i++) n += popcount(bits[i]);
      count[s] = n;
      if (n === 0) ok = false;
      compact(s);
    }
    for (let s = 0; s < nSlots && ok; s++) ok = narrowCells(s, -1);
    // (Also drains the queue when a cell was already emptied above.)
    ok = propagate() && ok;
    recording = true;
    return ok;
  };

  /** Place word `id` in slot s as the choice at depth d, and propagate. */
  const decide = (s: number, id: number, d: number): boolean => {
    const slot = slots[s];
    const ix = slot.index!;
    saveSlot(s, false);
    cand[s][0] = id;
    isList[s] = 1;
    count[s] = 1;
    slotWhy[s * W + (d >>> 5)] |= 1 << (d & 31);
    for (let p = 0; p < slot.len; p++) {
      const c = slot.cellAt[p];
      if (c < 0) continue;
      const nm = 1 << ix.codes[id * slot.len + p];
      if (mask[c] === nm) continue;
      saveCell(c);
      mask[c] = nm;
      for (let i = 0; i < W; i++) cellWhy[c * W + i] |= slotWhy[s * W + i];
      enqueue(c);
    }
    return propagate();
  };

  // ---- the search ----------------------------------------------------------
  let nodes = 0;
  let solutions = 0;
  let capped = false;
  let sliceEnd = 0;
  let optionEnd = 0;
  /** The STOP being unwound is just the current first word's slice ending. */
  let setAside = false;
  const backjump = opts.backjump !== false;
  let deadline = performance.now() + yieldMs;

  // Grid states proven to admit no fill, keyed by the letters settled so far.
  // Whether a state can be completed depends on nothing else — the candidate
  // sets are a pure function of those letters, and the no-repeats rule is
  // judged on the finished grid — so it holds however the state is reached.
  const dead = new Set<string>();
  const keyCodes = new Array<number>(nCells);
  const stateKey = (): string => {
    for (let c = 0; c < nCells; c++) {
      const m = mask[c];
      keyCodes[c] = m & (m - 1) ? 46 : 96 - Math.clz32(m); // "." or A–Z
    }
    return String.fromCharCode.apply(null, keyCodes);
  };
  const remember = (key: string) => {
    if (dead.size >= DEAD_CAP) dead.clear();
    dead.add(key);
  };

  /** Words placed by a choice on the current path -> the depth that chose. */
  const usedAt = new Map<string, number>();
  const confAt: Uint32Array[] = [];
  const idsAt: Int32Array[] = [];
  /** Blame every choice above depth d (when the real culprits are unknown). */
  const blameAll = (d: number) => {
    conflict.fill(0);
    for (let i = 0; i < d; i++) conflict[i >>> 5] |= 1 << (i & 31);
  };

  function* dfs(d: number): Generator<number, Outcome, void> {
    // Most-constrained open slot; at the root the author's word wins.
    let best = -1;
    let bestCount = Infinity;
    for (let s = 0; s < nSlots; s++) {
      const n = count[s];
      if (n <= 1) continue;
      if (d === 0 && slots[s].preferred) {
        best = s;
        break;
      }
      if (n < bestCount) {
        bestCount = n;
        best = s;
      }
    }

    if (best < 0) {
      // Every slot is down to one word: a fill, unless it repeats a word
      // (slots completed purely by their crossings aren't checked earlier).
      const seen = new Set<string>();
      for (let s = 0; s < nSlots; s++) {
        const w = slots[s].index!.words[cand[s][0]];
        if (seen.has(w)) {
          blameAll(d);
          return DEAD;
        }
        seen.add(w);
      }
      const solution: FillSolution = {};
      for (let c = 0; c < nCells; c++)
        solution[cellKeys[c]] = String.fromCharCode(96 - Math.clz32(mask[c]));
      solutions++;
      opts.onSolution(solution, nodes);
      if (solutions >= opts.maxSolutions) {
        capped = true;
        return STOP;
      }
      return SOL;
    }

    let key: string | null = null;
    if (dead.size) {
      key = stateKey();
      if (dead.has(key)) {
        blameAll(d);
        return DEAD;
      }
    }

    const slot = slots[best];
    const ix = slot.index!;
    const entered = nodes;
    // The candidates as ids, in order (best first). Copied out because the
    // slot's own set is rewritten by every word tried.
    let n = count[best];
    let ids = idsAt[d];
    if (!ids || ids.length < n) ids = idsAt[d] = new Int32Array(n);
    if (isList[best]) {
      const list = cand[best];
      for (let i = 0; i < n; i++) ids[i] = list[i];
    } else {
      const bits = cand[best];
      let k = 0;
      for (let i = 0; i < ix.nw; i++) {
        let x = bits[i];
        while (x) {
          const b = x & -x;
          x ^= b;
          ids[k++] = i * 32 + (31 - Math.clz32(b));
        }
      }
    }
    // This node's conflict set, seeded with the choices that had already
    // narrowed this slot: they share the blame if every word here fails.
    const conf = (confAt[d] ??= new Uint32Array(W));
    for (let i = 0; i < W; i++) conf[i] = slotWhy[best * W + i];
    const dBit = 1 << (d & 31);
    let found = false;
    let optionSlice = OPTION_SLICE;

    // One pass over the words — except at the root, which goes round again
    // (with a doubled slice) for the words it had to set aside.
    while (n > 0) {
      let kept = 0;
      for (let i = 0; i < n; i++) {
        const id = ids[i];
        const word = ix.words[id];
        const usedBy = usedAt.get(word);
        if (usedBy !== undefined) {
          conf[usedBy >>> 5] |= 1 << (usedBy & 31);
          continue;
        }
        if (d === 0) optionEnd = nodes + optionSlice;
        if (solutions === 0) {
          // Until the first fill, an attempt only gets its slice.
          if (nodes >= sliceEnd) return STOP;
        } else if (nodes >= optionEnd) {
          setAside = true;
          return STOP;
        }
        nodes++;
        if ((nodes & 31) === 0 && performance.now() >= deadline) {
          yield nodes;
          deadline = performance.now() + yieldMs;
        }

        const mark = tIdx.length;
        stamp++;
        usedAt.set(word, d);
        const r: Outcome = decide(best, id, d) ? yield* dfs(d + 1) : DEAD;
        usedAt.delete(word);
        undoTo(mark);

        if (r === STOP) {
          if (d > 0 || !setAside) return STOP;
          setAside = false;
          ids[kept++] = id;
          continue;
        }
        if (r === SOL) {
          // Unwind to the root, where the next word is the next option.
          if (d > 0) return SOL;
          found = true;
          continue;
        }
        if (backjump && !(conflict[d >>> 5] & dBit) && !found) {
          // The dead end below doesn't involve this slot's word at all, so
          // no other word here can avoid it: jump back to a choice it does
          // involve (`conflict` passes up as is).
          if (nodes - entered >= DEAD_MIN_NODES) remember(key ?? stateKey());
          return DEAD;
        }
        for (let j = 0; j < W; j++) conf[j] |= conflict[j];
      }
      n = kept;
      optionSlice *= 2;
    }

    // Every word failed. (At the root after fills were found, this is just
    // the end of the enumeration.)
    if (!found && nodes - entered >= DEAD_MIN_NODES) remember(key ?? stateKey());
    conf[d >>> 5] &= ~dBit;
    conflict.set(conf);
    return DEAD;
  }

  // Restart loop. Each attempt rebuilds the state under a new shuffle; the
  // dead states carry over, and the doubling slice guarantees an attempt
  // long enough to finish.
  let slice = FIRST_SLICE;
  for (let attempt = 0; ; attempt++) {
    const seed = (opts.seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0;
    if (!init(seed)) return { exhausted: true, nodes };
    sliceEnd = nodes + slice;
    const r = yield* dfs(0);
    if (r !== STOP) return { exhausted: true, nodes };
    if (capped) return { exhausted: false, nodes };
    slice *= 2;
  }
}
