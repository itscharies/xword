// Connectivity detection, shared by lib/sync.ts (retrying queued pushes on
// reconnect), lib/markSolved.ts and the offline-save UI (disabling "Save
// offline" when there's no network to fetch a puzzle with). `navigator.onLine`
// only means "attached to some network" — a captive portal or a down Supabase
// project still reports online — so once a network comes back we also confirm
// Supabase is actually reachable before trusting it, and keep probing on an
// interval while apparently offline in case the browser's own online/offline
// events never fire (e.g. a captive portal that never truly connects).
//
// This state never gates content — fetch outcomes do. It only decides whether
// to bother trying the network, and drives auth-js's token auto-refresh so a
// backgrounded phone doesn't spend 30 s bursts failing to refresh offline.

import { supabase, supabaseEnabled, supabaseUrl, supabaseKey, mockMode } from "./supabase.ts";

export type ConnState = "online" | "offline";

let state: ConnState = typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online";

const listeners = new Set<(s: ConnState) => void>();

function setState(next: ConnState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener(state);
}

export function getConnState(): ConnState {
  return state;
}

export function onConnChange(listener: (s: ConnState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_MS = 30_000;
const RESUME_PROBE_DELAY_MS = 1000;

/** Reachability check against Supabase itself, not just "some network
 *  exists." Any HTTP response at all — whatever the status — proves the
 *  network path works, so only a thrown/aborted request counts as
 *  unreachable.
 *
 *  Deliberately a raw `fetch`, not a client query: postgrest-js (without
 *  `.throwOnError()`) converts *every* rejected fetch, the 4 s abort
 *  included, into a resolved `{ error, status: 0 }` — so a probe written
 *  against the client could never report unreachable, and ~30 s after
 *  going offline the app flipped itself back to "online". Resolves `true`
 *  when there's nothing to reach (no Supabase configured, or the in-memory
 *  mock). */
async function probe(): Promise<boolean> {
  if (!supabaseEnabled || mockMode || !supabaseUrl) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      cache: "no-store",
      signal: controller.signal,
      headers: supabaseKey ? { apikey: supabaseKey } : undefined,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeAndSet(): Promise<void> {
  setState((await probe()) ? "online" : "offline");
  if (state === "offline") void pollWhileOffline();
  void syncAutoRefresh();
}

let polling = false;
async function pollWhileOffline(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    while (state === "offline") {
      await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
      if (state !== "offline") break;
      if (await probe()) setState("online");
    }
  } finally {
    polling = false;
  }
}

let autoRefreshApplied: ConnState | null = null;

/** Offline, auth-js's refresh timer fires every 30 s, each run spending
 *  ~25 s in its retry loop while holding the auth lock — which every client
 *  call then queues behind. Pause it until the network is back; reconnecting
 *  restarts it and the first tick refreshes the token.
 *
 *  Applied after `initialize()` settles, and after every probe rather than
 *  only on a state change: auth-js's own initialization ends by starting
 *  the ticker (and re-registering its visibility handler), and offline with
 *  an expired token that happens ~25 s after boot — a `stopAutoRefresh()`
 *  issued before then clears nothing and is undone, with the state already
 *  "offline" so no change event would ever re-issue it. Reads the state at
 *  apply time so queued calls can't apply a stale one out of order. */
async function syncAutoRefresh(): Promise<void> {
  if (!supabase || mockMode) return;
  await supabase.auth.initialize();
  const s = state;
  if (autoRefreshApplied === s) return;
  autoRefreshApplied = s;
  if (s === "offline") await supabase.auth.stopAutoRefresh();
  else await supabase.auth.startAutoRefresh();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void probeAndSet());
  window.addEventListener("offline", () => {
    setState("offline");
    void pollWhileOffline();
    void syncAutoRefresh();
  });
  // Resuming a backgrounded home-screen app: the radio can take a moment to
  // come back, so a probe fired on the very first frame would misreport.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(() => void probeAndSet(), RESUME_PROBE_DELAY_MS);
  });

  onConnChange(() => void syncAutoRefresh());
  void probeAndSet();

  if (import.meta.env.DEV) {
    (window as { __conn?: unknown }).__conn = { getConnState, probe };
  }
}
