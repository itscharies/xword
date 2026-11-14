// Autofill worker for the /create builder: runs the fill search (see
// lib/fillSearch.ts for the algorithm) off the main thread so it never blocks
// typing. The search is stepped in ~100ms slices with a trip through the
// event loop between them, so a "cancel" (or a superseding "fill") can
// interrupt it. It has no budget — it runs until it has covered the whole
// space, hit the solution cap, or been cancelled.

import { parseWordlist, type Suggestion } from "../lib/wordlist.ts";
import { fillSearch } from "../lib/fillSearch.ts";
import type { FillRequest, FillResponse, WorkerRequest } from "../lib/autofill.ts";

// Typed by hand so this file doesn't need the WebWorker lib alongside DOM.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: FillResponse) => void;
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---- word list (fetched once, kept across runs) ---------------------------
// Every entry is fair game for the fill: the list is already culled to
// fill-quality words at build time (see scripts/build-wordlist.ts).

let buckets: Map<number, Suggestion[]> | null = null;
let loadedFrom = "";

async function ensureWordlist(url: string) {
  if (!buckets || loadedFrom !== url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`wordlist ${r.status}`);
    buckets = parseWordlist(await r.text());
    loadedFrom = url;
  }
  return buckets;
}

// ---- message loop ----------------------------------------------------------

interface RunToken {
  cancelled: boolean;
}

async function run(req: FillRequest, token: RunToken) {
  const search = fillSearch(await ensureWordlist(req.wordlistUrl), {
    slots: req.slots,
    seed: req.seed,
    maxSolutions: req.maxSolutions,
    onSolution: (solution, nodes) =>
      ctx.postMessage({ type: "solution", runId: req.runId, solution, nodes }),
  });
  for (;;) {
    if (token.cancelled) return;
    const step = search.next();
    if (step.done) {
      ctx.postMessage({ type: "done", runId: req.runId, ...step.value });
      return;
    }
    ctx.postMessage({ type: "progress", runId: req.runId, nodes: step.value });
    await tick();
  }
}

// Runs are chained so a superseding "fill" waits for the cancelled one to
// notice its token and stop, keeping one search on the CPU at a time.
let current: RunToken = { cancelled: false };
let chain: Promise<void> = Promise.resolve();

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  current.cancelled = true;
  if (msg.type === "cancel") return;
  const token: RunToken = { cancelled: false };
  current = token;
  chain = chain.then(async () => {
    try {
      await run(msg, token);
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
