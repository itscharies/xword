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

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => PromiseLike<unknown> }>();
const DEBOUNCE_MS = 1500;

export type SaveStatus = "saving" | "saved";
type StatusListener = (status: SaveStatus) => void;
const statusListeners = new Map<string, Set<StatusListener>>();

function notifyStatus(key: string, status: SaveStatus): void {
  for (const listener of statusListeners.get(key) ?? []) listener(status);
}

/** Subscribe to one puzzle's save status: "saving" from the moment an edit
 *  schedules a write until the request lands, then "saved". Keyed the same
 *  way as `pushProgress`/`pushCommunityProgress`, so the Solver's indicator
 *  only reacts to its own puzzle. */
export function onSaveStatus(key: string, listener: StatusListener): () => void {
  let set = statusListeners.get(key);
  if (!set) {
    set = new Set();
    statusListeners.set(key, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

/** Schedules `run` under `key`, debounced — a second call with the same key
 *  before the delay elapses replaces the pending write rather than sending
 *  both. Exposed via `flushPendingPushes` so a backgrounded/closed tab still
 *  gets its last edit out instead of losing it to a pending timer. */
function schedule(key: string, run: () => PromiseLike<unknown>): void {
  clearTimeout(pending.get(key)?.timer);
  notifyStatus(key, "saving");
  const timer = setTimeout(() => {
    pending.delete(key);
    void run().then(() => notifyStatus(key, "saved"));
  }, DEBOUNCE_MS);
  pending.set(key, { timer, run });
}

/** Runs every still-pending debounced push immediately. Called when the tab
 *  is hidden or closing — a debounced setTimeout in a backgrounded tab can be
 *  throttled or never fire at all before the user checks another device. */
export function flushPendingPushes(): void {
  for (const [key, { timer, run }] of pending) {
    clearTimeout(timer);
    pending.delete(key);
    void run().then(() => notifyStatus(key, "saved"));
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPushes();
  });
  window.addEventListener("pagehide", flushPendingPushes);
  // Give a save still in flight a moment to land, and warn instead of letting
  // the tab close silently drop it — the fetch itself survives the unload
  // (see the `keepalive` fetch in supabase.ts), but only once it's sent.
  window.addEventListener("beforeunload", (e) => {
    if (pending.size === 0) return;
    flushPendingPushes();
    e.preventDefault();
    e.returnValue = "";
  });
}

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
  schedule(`${source}:${date}`, () =>
    supabase!.from("progress").upsert(
      {
        user_id: userId,
        source,
        puzzle_date: date,
        data: progress,
        client_updated_at: progress.updatedAt ?? Date.now(),
      },
      { onConflict: "user_id,source,puzzle_date" },
    ),
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
  schedule(`community:${puzzleId}`, () =>
    supabase!.from("progress").upsert(
      {
        user_id: userId,
        puzzle_id: puzzleId,
        data: progress,
        client_updated_at: progress.updatedAt ?? Date.now(),
      },
      { onConflict: "user_id,puzzle_id" },
    ),
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
