// One-shot, best-effort copy of the old IndexedDB (`xword` v1, stores
// `puzzles` and `outbox`, keyPath `key`) into their replacements: puzzle
// bodies into the Cache API via lib/cacheStore.ts, queued pushes into the
// localStorage outbox lib/sync.ts now reads. The only code left that talks
// to IndexedDB. Idempotent and retried every boot until the `xword:idb-
// migrated` flag is set; the flag is set — and the old database deleted —
// only after every write has landed, so an interrupted run just reruns.

import * as store from "./cacheStore.ts";
import { dispatchOfflineChanged, type CachedPuzzle, type OfflineIndexEntry } from "./offlineCache.ts";
import { getConnState } from "./online.ts";
import { retryOutbox } from "./sync.ts";

const DB_NAME = "xword";
const MIGRATED_KEY = "xword:idb-migrated";
const ATTEMPTS_KEY = "xword:idb-migrate-attempts";
const INDEX_KEY = "xword:offline-index";
const OUTBOX_KEY = "xword:outbox";
const OPEN_TIMEOUT_MS = 5000;
const MAX_OPEN_FAILURES = 3;

type Row = { key: string } & Record<string, unknown>;

function hasFlag(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

function setFlag(): void {
  localStorage.setItem(MIGRATED_KEY, "1");
  localStorage.removeItem(ATTEMPTS_KEY);
}

/** An open that *fails* (as opposed to timing out, which is the dead-
 *  network-process case and retried indefinitely) on several launches in a
 *  row is a corrupt or permanently locked database, not a busy one. Give up
 *  on it then: while the flag stays unset the mirror is never allowed to
 *  shrink, so entries for long-gone bodies would otherwise be listed as
 *  saved forever. */
function noteOpenFailure(err: unknown): void {
  let attempts = 1;
  try {
    attempts = Number(localStorage.getItem(ATTEMPTS_KEY) ?? 0) + 1;
    localStorage.setItem(ATTEMPTS_KEY, String(attempts));
  } catch {
    // Unwritable localStorage: treat as the first attempt and retry next boot.
  }
  if (attempts >= MAX_OPEN_FAILURES) {
    console.error(`[migrateIdb] open failed ${attempts} launches running; giving up on the old database`, err);
    setFlag();
  } else {
    console.error("[migrateIdb] open failed; will retry next launch", err);
  }
}

/** Opens the existing database at whatever version it has. A versionless
 *  open never upgrades — but if the database doesn't exist it would create
 *  an empty v1, so `upgradeneeded` aborts the transaction and the open
 *  rejects instead; the caller treats that as nothing to migrate. Resolves
 *  null on timeout: a hung open is the dead-network-process case, and the
 *  flag must stay unset so a later boot can try again. */
function openExisting(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, OPEN_TIMEOUT_MS);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME);
    } catch (err) {
      finish(() => reject(err));
      return;
    }
    req.onupgradeneeded = () => {
      req.transaction?.abort();
    };
    req.onsuccess = () => finish(() => resolve(req.result));
    req.onerror = () => finish(() => reject(req.error));
    req.onblocked = () => finish(() => resolve(null));
  });
}

function readAll(db: IDBDatabase, storeName: string): Promise<Row[]> {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as Row[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function readJsonObject<T>(key: string): Record<string, T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function readIndex(): OfflineIndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as OfflineIndexEntry[]).filter((e) => e && typeof e.key === "string") : [];
  } catch {
    return [];
  }
}

/** Contract C8 — never throws; every failure is logged and leaves the flag
 *  unset so the next boot retries. */
export async function migrateIdbToCacheStore(): Promise<void> {
  try {
    if (hasFlag()) return;
    if (typeof indexedDB === "undefined") {
      setFlag();
      return;
    }
    // Cheap short-circuit where supported: a fresh install has no `xword`
    // database, so skip the open entirely. Where `databases()` is missing
    // (older Safari) fall through to the open and let `upgradeneeded` tell us.
    if (typeof indexedDB.databases === "function") {
      let dbs: IDBDatabaseInfo[];
      try {
        dbs = await indexedDB.databases();
      } catch (err) {
        noteOpenFailure(err);
        return;
      }
      if (!dbs.some((d) => d.name === DB_NAME)) {
        setFlag();
        return;
      }
    }

    let db: IDBDatabase | null;
    try {
      db = await openExisting();
    } catch (err) {
      // Aborted `upgradeneeded` → database didn't exist. Anything else is a
      // real failure, retried next boot up to a cap.
      if (err instanceof DOMException && err.name === "AbortError") {
        setFlag();
        return;
      }
      noteOpenFailure(err);
      return;
    }
    if (!db) {
      console.warn("[migrateIdb] open timed out or was blocked; will retry next launch");
      return;
    }

    try {
      const [puzzles, outbox] = await Promise.all([readAll(db, "puzzles"), readAll(db, "outbox")]);

      const copied: CachedPuzzle[] = [];
      for (const row of puzzles as unknown as CachedPuzzle[]) {
        if (!row?.key || !row.puzzle) continue;
        if ((await store.get<CachedPuzzle>(row.key)) !== null) continue;
        await store.put(row);
        copied.push(row);
      }

      if (outbox.length > 0) {
        const existing = readJsonObject<Row>(OUTBOX_KEY);
        let changed = false;
        for (const entry of outbox) {
          if (!entry?.key || entry.key in existing) continue;
          existing[entry.key] = entry;
          changed = true;
        }
        if (changed) localStorage.setItem(OUTBOX_KEY, JSON.stringify(existing));
      }

      if (copied.length > 0) {
        const byKey = new Map(readIndex().map((e) => [e.key, e]));
        for (const p of copied) {
          byKey.set(p.key, {
            key: p.key,
            kind: p.kind,
            source: p.source,
            date: p.date,
            puzzleId: p.puzzleId,
            title: p.puzzle.title,
            savedAt: p.savedAt,
          });
        }
        localStorage.setItem(
          INDEX_KEY,
          JSON.stringify([...byKey.values()].sort((a, b) => b.savedAt - a.savedAt)),
        );
      }

      setFlag();
      db.close();
      db = null;
      await deleteDatabase();
      console.info(`[migrateIdb] migrated ${copied.length} puzzle(s), ${outbox.length} outbox row(s)`);

      dispatchOfflineChanged();
      if (outbox.length > 0 && getConnState() === "online") void retryOutbox();
    } finally {
      db?.close();
    }
  } catch (err) {
    console.error("[migrateIdb] migration failed; will retry next launch", err);
  }
}
