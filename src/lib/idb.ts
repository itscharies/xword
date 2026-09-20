// Thin promise wrapper around raw IndexedDB — the app's only persistent
// storage besides localStorage. Two stores share one database: `outbox`
// (progress pushes queued while offline, see lib/sync.ts) and `puzzles`
// (puzzle content saved for offline play, see lib/offlineCache.ts). Hand-
// rolled rather than a dependency (e.g. `idb`) since the app's needs are
// plain key/value get/put/delete plus a full-store scan — no cursors over
// indexes, no cross-store transactions.

const DB_NAME = "xword";
const DB_VERSION = 1;

export const STORES = {
  outbox: "outbox",
  puzzles: "puzzles",
} as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.error("[idb] failed to open database", req.error);
        resolve(null);
      };
    });
  }
  return dbPromise;
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const result = await wrap<T>(db.transaction(store, "readonly").objectStore(store).get(key));
    return result ?? null;
  } catch (err) {
    console.error(`[idb] get failed for ${store}/${key}`, err);
    return null;
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await wrap<T[]>(db.transaction(store, "readonly").objectStore(store).getAll());
  } catch (err) {
    console.error(`[idb] getAll failed for ${store}`, err);
    return [];
  }
}

/** Throws on failure (e.g. `QuotaExceededError`) — callers that need to
 *  surface a quota error to the user (offlineCache's savePuzzleOffline)
 *  catch this directly; callers doing best-effort persistence (sync's
 *  outbox) catch and log instead. */
export async function idbPut<T extends { key: string }>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  if (!db) throw new Error("IndexedDB is unavailable");
  await wrap(db.transaction(store, "readwrite").objectStore(store).put(value));
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
  } catch (err) {
    console.error(`[idb] delete failed for ${store}/${key}`, err);
  }
}
