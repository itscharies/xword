// Window-side key/value store for saved puzzle bodies, built on the Cache API
// instead of IndexedDB. The IndexedDB version kept one connection open for
// the page's lifetime and swallowed every error as "nothing saved"; WebKit
// severs that connection when it kills the network process behind a
// backgrounded home-screen app, which is exactly the "offline breaks after
// an hour" symptom. Here every operation opens the cache afresh (a cheap IPC
// round-trip, no handle to go stale), is bounded by a short timeout, retried
// once, and surfaces an `OfflineStoreUnavailableError` the UI can explain
// instead of pretending the data is gone.
//
// The cache name is `xword-puzzles` (contract C2): the service worker never
// opens, writes or deletes it, and this module never touches the worker's
// `xword-shell-*` caches.

const PUZZLES_CACHE = "xword-puzzles";
const OP_TIMEOUT_MS = 3000;

export class OfflineStoreUnavailableError extends Error {
  /** True when no relaunch can help — the Cache API itself is missing from
   *  this context — as opposed to a hung or failed open that a fresh process
   *  usually clears. The UI words its advice accordingly. */
  readonly permanent: boolean;
  constructor(message = "Offline storage is unavailable", permanent = false) {
    super(message);
    this.name = "OfflineStoreUnavailableError";
    this.permanent = permanent;
  }
}

/** Contract C3 — the synthetic same-origin URL a puzzle body is stored
 *  under. Lives under the app's base so the request matches nothing real;
 *  sw.js returns early for any pathname containing `/__offline/`. */
export function puzzleEntryUrl(key: string): string {
  return new URL(`${import.meta.env.BASE_URL}__offline/puzzles/${encodeURIComponent(key)}`, location.origin).href;
}

function timeoutAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OfflineStoreUnavailableError(`Cache operation timed out after ${ms}ms`)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

async function attempt<T>(op: (cache: Cache) => Promise<T>): Promise<T> {
  const t = timeoutAfter(OP_TIMEOUT_MS);
  try {
    return await Promise.race([caches.open(PUZZLES_CACHE).then(op), t.promise]);
  } finally {
    t.cancel();
  }
}

/** Fresh `caches.open()` per call, one retry after a failure. Anything that
 *  still fails is wrapped as `OfflineStoreUnavailableError`, except a
 *  `QuotaExceededError`, which is the caller's to report and is rethrown
 *  as-is. */
async function withCache<T>(op: (cache: Cache) => Promise<T>): Promise<T> {
  if (typeof caches === "undefined") throw new OfflineStoreUnavailableError("Cache API is not available", true);
  try {
    return await attempt(op);
  } catch (first) {
    if (first instanceof DOMException && first.name === "QuotaExceededError") throw first;
    try {
      return await attempt(op);
    } catch (second) {
      if (second instanceof DOMException && second.name === "QuotaExceededError") throw second;
      if (second instanceof OfflineStoreUnavailableError) throw second;
      throw new OfflineStoreUnavailableError(second instanceof Error ? second.message : String(second));
    }
  }
}

export async function get<T>(key: string): Promise<T | null> {
  return withCache(async (cache) => {
    const res = await cache.match(puzzleEntryUrl(key));
    return res ? ((await res.json()) as T) : null;
  });
}

/** Every stored value, in no particular order. A single unparseable body is
 *  skipped rather than failing the whole listing. */
export async function getAll<T>(): Promise<T[]> {
  return withCache(async (cache) => {
    const responses = await cache.matchAll();
    const out: T[] = [];
    for (const res of responses) {
      try {
        out.push((await res.json()) as T);
      } catch (err) {
        console.error("[cacheStore] skipping unreadable entry", res.url, err);
      }
    }
    return out;
  });
}

export async function put<T extends { key: string }>(value: T): Promise<void> {
  await withCache((cache) =>
    cache.put(
      puzzleEntryUrl(value.key),
      new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }),
    ),
  );
}

export async function remove(key: string): Promise<void> {
  await withCache((cache) => cache.delete(puzzleEntryUrl(key)).then(() => undefined));
}

/** Asks the browser not to evict our origin's storage under pressure. iOS
 *  grants this silently for home-screen apps; elsewhere it may prompt or be
 *  denied, and either way the app works the same, so failures are ignored. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
