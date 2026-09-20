// Connectivity detection, shared by lib/sync.ts (retrying queued pushes on
// reconnect) and the offline-save UI (disabling "Save offline" when there's
// no network to fetch a puzzle with). `navigator.onLine` only means
// "attached to some network" — a captive portal or a down Supabase project
// still reports online — so once a network comes back we also confirm
// Supabase is actually reachable before trusting it, and keep probing on an
// interval while apparently offline in case the browser's own online/offline
// events never fire (e.g. a captive portal that never truly connects).

import { supabase, supabaseEnabled } from "./supabase.ts";

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

/** Best-effort reachability check against Supabase itself, not just "some
 *  network exists." Any response at all — including a query-level error —
 *  proves the network path works, so only a thrown/aborted request counts as
 *  unreachable. No-ops to `true` when Supabase isn't configured; nothing to
 *  reach in a pure-localStorage build. */
async function probe(): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await supabase.from("progress").select("user_id", { head: true }).abortSignal(controller.signal).limit(1);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void probe().then((ok) => setState(ok ? "online" : "offline"));
  });
  window.addEventListener("offline", () => {
    setState("offline");
    void pollWhileOffline();
  });
  if (state === "offline") void pollWhileOffline();
}
