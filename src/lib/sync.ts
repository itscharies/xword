// Local-first sync between localStorage and Supabase. localStorage stays the
// single source of truth the UI reads from (Archive's badges, Solver's
// initial load); this module only reconciles it against the server
// asynchronously, around sign-in and on each save while signed in.

import { supabase } from "./supabase.ts";
import { saveProgress, listAllProgress, type Progress } from "./storage.ts";
import type { PuzzleSource } from "./sources.ts";

type RemoteRow = {
  source: string;
  puzzle_date: string;
  data: Progress;
  client_updated_at: number;
};

/** Bring local and remote progress into agreement: whichever side has the
 *  newer timestamp wins and is written to both. Whole-row last-write-wins,
 *  not a per-cell merge — deliberately simple for a handful of users who
 *  aren't editing the same puzzle from two devices at once. Run once per
 *  sign-in / session restore; never mid-solve. */
export async function reconcileAll(userId: string): Promise<void> {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("progress")
    .select("source, puzzle_date, data, client_updated_at")
    .not("source", "is", null);
  if (error) return;

  const remoteByKey = new Map<string, RemoteRow>(
    (data ?? []).map((r) => [`${r.source}:${r.puzzle_date}`, r as RemoteRow]),
  );

  const toPush: RemoteRow[] = [];

  for (const { source, date, progress } of listAllProgress()) {
    const remoteKey = `${source}:${date}`;
    const remote = remoteByKey.get(remoteKey);
    remoteByKey.delete(remoteKey);

    const localTime = progress.updatedAt ?? 0;
    const remoteTime = remote?.client_updated_at ?? -1;

    if (remoteTime > localTime) {
      saveProgress(source, date, remote!.data);
    } else if (!remote || localTime > remoteTime) {
      toPush.push({ source, puzzle_date: date, data: progress, client_updated_at: localTime });
    }
  }

  // Remaining remote rows have no local counterpart at all (solved on
  // another device, never opened here) — pull them in.
  for (const remote of remoteByKey.values()) {
    saveProgress(remote.source as PuzzleSource, remote.puzzle_date, remote.data);
  }

  if (toPush.length > 0) {
    await supabase.from("progress").upsert(
      toPush.map((r) => ({ user_id: userId, ...r })),
      { onConflict: "user_id,source,puzzle_date" },
    );
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1500;

/** Debounced upsert of one puzzle's progress, keyed per puzzle so switching
 *  puzzles doesn't cancel a different puzzle's pending write. No-ops if
 *  signed out or Supabase isn't configured. */
export function pushProgress(
  userId: string | null,
  source: PuzzleSource,
  date: string,
  progress: Progress,
): void {
  if (!supabase || !userId) return;
  const key = `${source}:${date}`;
  clearTimeout(pending.get(key));
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void supabase!.from("progress").upsert(
        {
          user_id: userId,
          source,
          puzzle_date: date,
          data: progress,
          client_updated_at: progress.updatedAt ?? Date.now(),
        },
        { onConflict: "user_id,source,puzzle_date" },
      );
    }, DEBOUNCE_MS),
  );
}

/** Same as pushProgress, but for a published (/p/<id>) puzzle — keyed by
 *  `puzzle_id` instead of `source`/`puzzle_date`. */
export function pushCommunityProgress(
  userId: string | null,
  puzzleId: string,
  progress: Progress,
): void {
  if (!supabase || !userId) return;
  const key = `community:${puzzleId}`;
  clearTimeout(pending.get(key));
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void supabase!.from("progress").upsert(
        {
          user_id: userId,
          puzzle_id: puzzleId,
          data: progress,
          client_updated_at: progress.updatedAt ?? Date.now(),
        },
        { onConflict: "user_id,puzzle_id" },
      );
    }, DEBOUNCE_MS),
  );
}

/** One-off pull of a single community puzzle's remote progress — used when
 *  opening a /p/<id> puzzle, before the local copy is read, so a signed-in
 *  user's progress from another device is in place before Solver mounts. */
export async function pullCommunityProgress(
  userId: string,
  puzzleId: string,
): Promise<Progress | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", userId)
    .eq("puzzle_id", puzzleId)
    .maybeSingle();
  return data?.data ?? null;
}

/** Same as pullCommunityProgress, but for a syndicated (source, date) puzzle.
 *  reconcileAll already does a bulk version of this on sign-in, but that's a
 *  one-off race against whichever puzzle happens to mount first — a fresh
 *  device opening a puzzle link straight away can render Solver before that
 *  bulk reconcile finishes, and nothing re-reads localStorage afterwards.
 *  Pulling per-puzzle here, before Solver mounts, closes that gap. */
export async function pullProgress(
  userId: string,
  source: PuzzleSource,
  date: string,
): Promise<Progress | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", userId)
    .eq("source", source)
    .eq("puzzle_date", date)
    .maybeSingle();
  return data?.data ?? null;
}
