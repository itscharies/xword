// Local-first sync between localStorage and Supabase. localStorage stays the
// single source of truth the UI reads from (Archive's badges, Solver's
// initial load); this module only reconciles it against the server
// asynchronously, around sign-in and on each save while signed in.

import { supabase } from "./supabase.ts";
import { saveProgress, listAllProgress, type Progress } from "./storage.ts";
import type { PuzzleSource } from "./sources.ts";
import { getConnState } from "./online.ts";
import { idbDelete, idbGetAll, idbPut, STORES } from "./idb.ts";

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
  if (error) {
    console.error("[sync] reconcileAll: fetching remote progress failed", error);
    return;
  }

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
    const { error: pushError } = await supabase.from("progress").upsert(
      toPush.map((r) => ({ user_id: userId, ...r })),
      { onConflict: "user_id,source,puzzle_date" },
    );
    if (pushError) console.error("[sync] reconcileAll: pushing local progress failed", pushError);
  }
}

type PushResult = { error: { message: string } | null };

/** One queued progress push — either a syndicated (source, date) puzzle or a
 *  community (puzzle_id) one, carrying everything `doPush` needs to replay
 *  it later without the caller's original closure. Persisted to IndexedDB's
 *  `outbox` store (see lib/idb.ts) whenever a push fails, so a failed write
 *  survives a reload instead of being lost with the in-memory debounce
 *  timer — the one thing the old debounce-only design couldn't do. */
interface OutboxEntry {
  key: string;
  kind: "syndicated" | "community";
  userId: string;
  source?: PuzzleSource;
  date?: string;
  puzzleId?: string;
  progress: Progress;
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; entry: OutboxEntry }>();
const DEBOUNCE_MS = 1500;

export type SaveStatus = "saving" | "saved" | "error" | "queued";
type StatusListener = (status: SaveStatus) => void;
const statusListeners = new Map<string, Set<StatusListener>>();

function notifyStatus(key: string, status: SaveStatus): void {
  for (const listener of statusListeners.get(key) ?? []) listener(status);
}

/** Subscribe to one puzzle's save status: "saving" from the moment an edit
 *  schedules a write until the request lands, then "saved" — or, if it
 *  didn't, "queued" (offline; will retry automatically) or "error" (online,
 *  but the write still failed — worth a user-visible warning, since a failed
 *  request used to resolve silently, which is exactly the kind of thing that
 *  looks like "it said saved but never showed up on my other device").
 *  Keyed the same way as `pushProgress`/`pushCommunityProgress`, so the
 *  Solver's indicator only reacts to its own puzzle. */
export function onSaveStatus(key: string, listener: StatusListener): () => void {
  let set = statusListeners.get(key);
  if (!set) {
    set = new Set();
    statusListeners.set(key, set);
  }
  set.add(listener);
  return () => set!.delete(listener);
}

function doPush(entry: OutboxEntry): PromiseLike<PushResult> {
  if (!supabase) return Promise.resolve({ error: { message: "Supabase isn't configured." } });
  if (entry.kind === "syndicated") {
    return supabase.from("progress").upsert(
      {
        user_id: entry.userId,
        source: entry.source,
        puzzle_date: entry.date,
        data: entry.progress,
        client_updated_at: entry.progress.updatedAt ?? Date.now(),
      },
      { onConflict: "user_id,source,puzzle_date" },
    );
  }
  return supabase.from("progress").upsert(
    {
      user_id: entry.userId,
      puzzle_id: entry.puzzleId,
      data: entry.progress,
      client_updated_at: entry.progress.updatedAt ?? Date.now(),
    },
    { onConflict: "user_id,puzzle_id" },
  );
}

/** Best-effort — losing a queued entry here is no worse than the old
 *  behavior (nothing was ever persisted at all), so failures are logged, not
 *  thrown, and never block reporting the push's own status. */
async function enqueueOutbox(entry: OutboxEntry): Promise<void> {
  try {
    await idbPut(STORES.outbox, entry);
  } catch (err) {
    console.error(`[sync] failed to persist outbox entry for "${entry.key}"`, err);
  }
}

async function dequeueOutbox(key: string): Promise<void> {
  await idbDelete(STORES.outbox, key);
}

/** Runs `entry`'s push, reporting "saved" only if it actually succeeded.
 *  A failure — whether a Postgrest-level error (returned) or a network-level
 *  one (thrown, e.g. offline or the keepalive-fetch byte quota rejecting the
 *  request outright) — is queued for retry rather than dropped. The status
 *  shown distinguishes "offline, this'll sync itself" (queued) from "online
 *  but still failing" (error, worth a user-visible warning): a thrown
 *  request all but always means no network path at all, and a returned
 *  error while `getConnState()` already reads offline is the same signal
 *  arriving a different way. */
function runAndReport(entry: OutboxEntry): void {
  Promise.resolve(doPush(entry)).then(
    (result) => {
      if (result?.error) {
        console.error(`[sync] push failed for "${entry.key}"`, result.error);
        void enqueueOutbox(entry);
        notifyStatus(entry.key, getConnState() === "offline" ? "queued" : "error");
      } else {
        void dequeueOutbox(entry.key);
        notifyStatus(entry.key, "saved");
      }
    },
    (err) => {
      console.error(`[sync] push threw for "${entry.key}"`, err);
      void enqueueOutbox(entry);
      notifyStatus(entry.key, "queued");
    },
  );
}

/** Schedules `entry`'s push, debounced — a second call for the same key
 *  before the delay elapses replaces the pending write rather than sending
 *  both. Exposed via `flushPendingPushes` so a backgrounded/closed tab still
 *  gets its last edit out instead of losing it to a pending timer. */
function schedule(entry: OutboxEntry): void {
  clearTimeout(pending.get(entry.key)?.timer);
  notifyStatus(entry.key, "saving");
  const timer = setTimeout(() => {
    pending.delete(entry.key);
    runAndReport(entry);
  }, DEBOUNCE_MS);
  pending.set(entry.key, { timer, entry });
}

/** Runs every still-pending debounced push immediately. Called when the tab
 *  is hidden or closing — a debounced setTimeout in a backgrounded tab can be
 *  throttled or never fire at all before the user checks another device. */
export function flushPendingPushes(): void {
  for (const [key, { timer, entry }] of pending) {
    clearTimeout(timer);
    pending.delete(key);
    runAndReport(entry);
  }
}

/** Replays every queued outbox entry — called on reconnect, once on app
 *  boot, and when the tab becomes visible again, so a write that failed
 *  while offline goes out as soon as there's a real chance it'll land,
 *  without the user having to revisit that puzzle to re-trigger it. Pulls
 *  the current remote row first and skips the replay if another device has
 *  since pushed something newer for the same puzzle — the same whole-row
 *  last-write-wins-by-`updatedAt` rule `reconcileAll` uses, just applied
 *  per-key instead of in one bulk pass. */
export async function retryOutbox(): Promise<void> {
  if (!supabase) return;
  const entries = await idbGetAll<OutboxEntry>(STORES.outbox);
  for (const entry of entries) {
    const remote =
      entry.kind === "syndicated"
        ? await pullProgress(entry.userId, entry.source!, entry.date!)
        : await pullCommunityProgress(entry.userId, entry.puzzleId!);
    const localTime = entry.progress.updatedAt ?? 0;
    const remoteTime = remote?.updatedAt ?? -1;
    if (remote && remoteTime > localTime) {
      // Remote is newer — drop the stale queued write. The next time this
      // puzzle opens, the existing pull-before-mount reconcile in App.tsx
      // picks up the fresher remote copy on its own.
      await dequeueOutbox(entry.key);
      continue;
    }
    runAndReport(entry);
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPushes();
    else void retryOutbox();
  });
  window.addEventListener("pagehide", flushPendingPushes);
  window.addEventListener("online", () => void retryOutbox());
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
  schedule({ key: `${source}:${date}`, kind: "syndicated", userId, source, date, progress });
}

/** Same as pushProgress, but for a published (/p/<id>) puzzle — keyed by
 *  `puzzle_id` instead of `source`/`puzzle_date`. */
export function pushCommunityProgress(
  userId: string | null,
  puzzleId: string,
  progress: Progress,
): void {
  if (!supabase || !userId) return;
  schedule({ key: `community:${puzzleId}`, kind: "community", userId, puzzleId, progress });
}

/** One-off pull of a single community puzzle's remote progress — used when
 *  opening a /p/<id> puzzle, before the local copy is read, so a signed-in
 *  user's progress from another device is in place before Solver mounts. */
export async function pullCommunityProgress(
  userId: string,
  puzzleId: string,
): Promise<Progress | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", userId)
    .eq("puzzle_id", puzzleId)
    .maybeSingle();
  // A failed fetch here must not look like "no remote progress exists" —
  // that reads as this device correctly having nothing to catch up on, when
  // really the check just never happened.
  if (error) console.error(`[sync] pull failed for community:${puzzleId}`, error);
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
  const { data, error } = await supabase
    .from("progress")
    .select("data")
    .eq("user_id", userId)
    .eq("source", source)
    .eq("puzzle_date", date)
    .maybeSingle();
  if (error) console.error(`[sync] pull failed for ${source}:${date}`, error);
  return data?.data ?? null;
}
