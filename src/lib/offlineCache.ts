// Puzzle content saved for offline play — a manual, per-puzzle action (see
// the "Save offline" toggle on Archive tiles and in the Solver actionbar),
// distinct from `Progress` (lib/storage.ts), which is always saved locally
// regardless of this cache. Keyed the same way as `Progress` so the two line
// up: `<source>:<date>` for syndicated puzzles, `community:<id>` for
// published ones. Mutual/solve-together data is never cached here — an
// offline load always shows "no one else has started" (`mutualProgress: []`),
// which the Solver already treats as a normal, valid state.

import { idbDelete, idbGet, idbGetAll, idbPut, STORES } from "./idb.ts";
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

export const syndicatedOfflineKey = (source: PuzzleSource, date: string): string => `${source}:${date}`;
export const communityOfflineKey = (id: string): string => `community:${id}`;

export async function isPuzzleSavedOffline(key: string): Promise<boolean> {
  return (await idbGet<CachedPuzzle>(STORES.puzzles, key)) !== null;
}

export function getPuzzleOffline(key: string): Promise<CachedPuzzle | null> {
  return idbGet<CachedPuzzle>(STORES.puzzles, key);
}

/** Newest-saved first, for the "manage offline puzzles" list. */
export async function listOfflinePuzzles(): Promise<CachedPuzzle[]> {
  const all = await idbGetAll<CachedPuzzle>(STORES.puzzles);
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export type SaveOfflineResult = { ok: true } | { ok: false; error: string };

async function put(entry: CachedPuzzle): Promise<SaveOfflineResult> {
  try {
    await idbPut(STORES.puzzles, entry);
    return { ok: true };
  } catch (err) {
    console.error(`[offlineCache] failed to save "${entry.key}"`, err);
    const quotaExceeded = err instanceof DOMException && err.name === "QuotaExceededError";
    return {
      ok: false,
      error: quotaExceeded
        ? "Couldn't save offline — storage is full. Remove some saved puzzles and try again."
        : "Couldn't save this puzzle for offline play.",
    };
  }
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

export async function removePuzzleOffline(key: string): Promise<void> {
  await idbDelete(STORES.puzzles, key);
}

/** Storage usage for the "manage offline puzzles" UI. Null when the
 *  Storage API isn't available (older Safari) rather than a fake 0/0. */
export async function estimateOfflineUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage == null || quota == null) return null;
  return { usage, quota };
}
