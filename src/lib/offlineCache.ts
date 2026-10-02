// Puzzle content saved for offline play — a manual, per-puzzle action (see
// the "Save offline" toggle on Archive tiles and in the Solver actionbar),
// distinct from `Progress` (lib/storage.ts), which is always saved locally
// regardless of this cache. Keyed the same way as `Progress` so the two line
// up: `<source>:<date>` for syndicated puzzles, `community:<id>` for
// published ones. Mutual/solve-together data is never cached here — an
// offline load always shows "no one else has started" (`mutualProgress: []`),
// which the Solver already treats as a normal, valid state.
//
// Bodies live in the Cache API (lib/cacheStore.ts). Alongside them, a
// body-less index mirror sits in localStorage (`xword:offline-index`) —
// localStorage belongs to the WebContent process and survives WebKit killing
// the network process, so the Archive can still list what *should* be saved,
// with an honest notice, when the store itself can't be reached.

import * as store from "./cacheStore.ts";
import { OfflineStoreUnavailableError } from "./cacheStore.ts";
import type { Puzzle } from "../types.ts";
import type { PuzzleSource } from "./sources.ts";

export interface CachedPuzzle {
  key: string;
  kind: "syndicated" | "community";
  source?: PuzzleSource;
  date?: string;
  puzzleId?: string;
  puzzle: Puzzle;
  /** Community puzzles only — the Solver needs this to decide whether the
   *  viewer can edit it, the same as the live (non-cached) fetch provides. */
  authorId?: string;
  savedAt: number;
}

/** What the mirror keeps per saved puzzle: enough to render a tappable tile
 *  and open the right route, never the puzzle body. */
export interface OfflineIndexEntry {
  key: string;
  kind: "syndicated" | "community";
  source?: PuzzleSource;
  date?: string;
  puzzleId?: string;
  title?: string;
  savedAt: number;
}

export const syndicatedOfflineKey = (source: PuzzleSource, date: string): string => `${source}:${date}`;
export const communityOfflineKey = (id: string): string => `community:${id}`;

const INDEX_KEY = "xword:offline-index";
const MIGRATED_KEY = "xword:idb-migrated";
const PERSIST_REQUESTED_KEY = "xword:persist-requested";
const OFFLINE_CHANGED_EVENT = "xword:offline-changed";

const STORE_UNAVAILABLE_READ_MSG = "Saved puzzles can't be read right now — close the app fully and reopen it.";
const STORE_UNAVAILABLE_SAVE_MSG = "Couldn't save — offline storage isn't available on this device right now.";
const STORE_MISSING_MSG = "Offline storage isn't available in this browser.";

/** The user-facing store error for an unavailable store: the relaunch advice
 *  only when a relaunch could help. */
function unavailableMsg(err: OfflineStoreUnavailableError, transientMsg: string): string {
  return err.permanent ? STORE_MISSING_MSG : transientMsg;
}

// ---------------------------------------------------------------------------
// Index mirror

export function readOfflineIndex(): OfflineIndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as OfflineIndexEntry[]).filter((e) => e && typeof e.key === "string");
  } catch {
    return [];
  }
}

function writeOfflineIndex(entries: OfflineIndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries.sort((a, b) => b.savedAt - a.savedAt)));
  } catch (err) {
    console.error("[offlineCache] failed to write offline index", err);
  }
}

function toIndexEntry(p: CachedPuzzle): OfflineIndexEntry {
  return {
    key: p.key,
    kind: p.kind,
    source: p.source,
    date: p.date,
    puzzleId: p.puzzleId,
    title: p.puzzle.title,
    savedAt: p.savedAt,
  };
}

function upsertIndex(puzzles: CachedPuzzle[]): void {
  if (puzzles.length === 0) return;
  const byKey = new Map(readOfflineIndex().map((e) => [e.key, e]));
  for (const p of puzzles) byKey.set(p.key, toIndexEntry(p));
  writeOfflineIndex([...byKey.values()]);
}

function removeFromIndex(key: string): void {
  writeOfflineIndex(readOfflineIndex().filter((e) => e.key !== key));
}

/** True once `migrateIdbToCacheStore` has copied (or found nothing to copy
 *  from) the old IndexedDB. Until then the mirror may know about puzzles the
 *  store doesn't yet hold, so listings must not shrink it. */
export function isOfflineStoreMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Store error + change notifications

let storeError: string | null = null;
const errorListeners = new Set<(msg: string | null) => void>();

/** The current store-level problem, if any — set when the Cache API times
 *  out or is missing, cleared by the next successful operation. UI shows it
 *  next to the mirror list so "unreadable right now" never reads as "empty". */
export function getOfflineStoreError(): string | null {
  return storeError;
}

export function onOfflineStoreError(listener: (msg: string | null) => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

function setStoreError(next: string | null): void {
  if (next === storeError) return;
  storeError = next;
  for (const listener of errorListeners) listener(next);
}

/** Contract C12 — fired after any save, remove or migration so listings
 *  (Archive, Settings) re-read without a prop-drilled callback. */
export function dispatchOfflineChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_CHANGED_EVENT));
}

// ---------------------------------------------------------------------------
// Reads

export async function getPuzzleOffline(key: string): Promise<CachedPuzzle | null> {
  try {
    const hit = await store.get<CachedPuzzle>(key);
    setStoreError(null);
    if (hit) upsertIndex([hit]);
    return hit;
  } catch (err) {
    console.error(`[offlineCache] get failed for "${key}"`, err);
    if (err instanceof OfflineStoreUnavailableError) setStoreError(unavailableMsg(err, STORE_UNAVAILABLE_READ_MSG));
    return null;
  }
}

/** Newest-saved first, for the Archive's offline list and the "manage
 *  offline puzzles" UI. Returns `[]` and sets the store error when the store
 *  can't be reached — callers fall back to `readOfflineIndex()`. */
export async function listOfflinePuzzles(): Promise<CachedPuzzle[]> {
  let all: CachedPuzzle[];
  try {
    all = await store.getAll<CachedPuzzle>();
    setStoreError(null);
  } catch (err) {
    console.error("[offlineCache] list failed", err);
    if (err instanceof OfflineStoreUnavailableError) setStoreError(unavailableMsg(err, STORE_UNAVAILABLE_READ_MSG));
    return [];
  }
  all.sort((a, b) => b.savedAt - a.savedAt);
  // Before migration the store is authoritative for nothing: rewriting the
  // mirror from its rows would empty it on the Archive's first mount, right
  // before the migration copies the old puzzles in.
  if (isOfflineStoreMigrated()) writeOfflineIndex(all.map(toIndexEntry));
  else upsertIndex(all);
  return all;
}

// ---------------------------------------------------------------------------
// Writes

export type SaveOfflineResult = { ok: true } | { ok: false; error: string };

function requestPersistOnce(): void {
  try {
    if (localStorage.getItem(PERSIST_REQUESTED_KEY) === "1") return;
    localStorage.setItem(PERSIST_REQUESTED_KEY, "1");
  } catch {
    return;
  }
  void store.requestPersistentStorage();
}

async function put(entry: CachedPuzzle): Promise<SaveOfflineResult> {
  try {
    await store.put(entry);
  } catch (err) {
    console.error(`[offlineCache] failed to save "${entry.key}"`, err);
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      return {
        ok: false,
        error: "Couldn't save offline — storage is full. Remove some saved puzzles and try again.",
      };
    }
    if (err instanceof OfflineStoreUnavailableError) {
      const msg = unavailableMsg(err, STORE_UNAVAILABLE_SAVE_MSG);
      setStoreError(msg);
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Couldn't save this puzzle for offline play." };
  }
  setStoreError(null);
  upsertIndex([entry]);
  dispatchOfflineChanged();
  requestPersistOnce();
  return { ok: true };
}

export function saveSyndicatedOffline(
  source: PuzzleSource,
  date: string,
  puzzle: Puzzle,
): Promise<SaveOfflineResult> {
  return put({ key: syndicatedOfflineKey(source, date), kind: "syndicated", source, date, puzzle, savedAt: Date.now() });
}

export function saveCommunityOffline(id: string, puzzle: Puzzle, authorId: string): Promise<SaveOfflineResult> {
  return put({ key: communityOfflineKey(id), kind: "community", puzzleId: id, puzzle, authorId, savedAt: Date.now() });
}

/** The mirror entry goes only once the store delete has landed. Dropping it
 *  on a failed delete would only hide the puzzle until the next healthy
 *  `listOfflinePuzzles`, which rewrites the mirror *from* store rows and so
 *  would list the orphaned body as saved again; leaving it is honest, and
 *  the store error it sets says why the removal didn't take. */
export async function removePuzzleOffline(key: string): Promise<void> {
  try {
    await store.remove(key);
    setStoreError(null);
    removeFromIndex(key);
  } catch (err) {
    console.error(`[offlineCache] remove failed for "${key}"`, err);
    if (err instanceof OfflineStoreUnavailableError) setStoreError(unavailableMsg(err, STORE_UNAVAILABLE_READ_MSG));
  }
  dispatchOfflineChanged();
}

/** Storage usage for the "manage offline puzzles" UI. Null when the
 *  Storage API isn't available (older Safari) rather than a fake 0/0. */
export async function estimateOfflineUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage == null || quota == null) return null;
  return { usage, quota };
}
