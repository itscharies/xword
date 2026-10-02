import { getConnState } from "./online.ts";
import type { PuzzleSource } from "./sources.ts";
import {
  loadCommunityProgress,
  loadProgress,
  saveCommunityProgress,
  saveProgress,
  type Progress,
} from "./storage.ts";
import { pullCommunityProgress, pullProgress, pushCommunityProgress, pushProgress } from "./sync.ts";

/** Which puzzle's progress to flag — the two keyings storage.ts and sync.ts
 *  already use (source+date for syndicated, puzzle id for community). */
export type ProgressTarget =
  | { kind: "syndicated"; source: PuzzleSource; date: string }
  | { kind: "community"; puzzleId: string };

function load(target: ProgressTarget): Progress | null {
  return target.kind === "syndicated"
    ? loadProgress(target.source, target.date)
    : loadCommunityProgress(target.puzzleId);
}

function save(target: ProgressTarget, progress: Progress): void {
  if (target.kind === "syndicated") saveProgress(target.source, target.date, progress);
  else saveCommunityProgress(target.puzzleId, progress);
}

function push(target: ProgressTarget, userId: string | null, progress: Progress): void {
  if (target.kind === "syndicated") pushProgress(userId, target.source, target.date, progress);
  else pushCommunityProgress(userId, target.puzzleId, progress);
}

function pull(target: ProgressTarget, userId: string): Promise<Progress | null> {
  return target.kind === "syndicated"
    ? pullProgress(userId, target.source, target.date)
    : pullCommunityProgress(userId, target.puzzleId);
}

/** Set or clear a puzzle's solved flag without touching its grid — the
 *  read/unread of an email, not a solve. Loads the existing Progress (or
 *  creates a blank one: entries [], revealed [], elapsed 0), sets
 *  `completed`, stamps `updatedAt: Date.now()`, saves to localStorage, pushes
 *  via sync.ts when `userId` is non-null (a no-op otherwise, like every
 *  push), and returns the Progress that was written locally.
 *
 *  updatedAt is load-bearing: reconcileAll and retryOutbox in sync.ts and the
 *  pull-before-mount in App.tsx all decide whole-row last-write-wins on it, so
 *  a flag written without it (localTime 0) would lose to any remote row.
 *
 *  The same LWW cuts the other way: the Archive never pulls before it writes
 *  (the Solver does, before mount), so a tab left open for hours holds stale
 *  entries that a fresh updatedAt would push over another device's newer
 *  grid. So when signed in and online the push waits for a pull, and a newer
 *  remote row is adopted (and saved locally) with the flag applied on top;
 *  the local write and badge update stay synchronous. Offline, the queued
 *  push already gets this check from retryOutbox. */
export function markSolved(
  target: ProgressTarget,
  completed: boolean,
  userId: string | null,
): Progress {
  const existing = load(target);
  const next: Progress = {
    ...(existing ?? { entries: [], revealed: [], elapsed: 0 }),
    completed,
    updatedAt: Date.now(),
  };
  save(target, next);
  if (!userId || getConnState() !== "online") {
    push(target, userId, next);
    return next;
  }
  void pull(target, userId).then((remote) => {
    // A second swipe (or an opened Solver) may have written since; that
    // write does its own reconcile, so this one stands down.
    if (load(target)?.updatedAt !== next.updatedAt) return;
    if (remote && (remote.updatedAt ?? 0) > (existing?.updatedAt ?? 0)) {
      const merged: Progress = { ...remote, completed, updatedAt: Date.now() };
      save(target, merged);
      push(target, userId, merged);
    } else {
      push(target, userId, next);
    }
  });
  return next;
}
