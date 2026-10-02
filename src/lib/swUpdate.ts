// Service worker registration and the "a new version is ready" pub-sub
// consumed by components/UpdateToast.tsx. See public/sw.js for the precache
// logic this manages the client side of, and scripts/build-sw.ts for how the
// asset list + version get stamped into the worker at build time.

import { flushPendingPushes } from "./sync.ts";

const SHELL_PREFIX = "xword-shell-";
const UPDATE_CHECK_THROTTLE_MS = 60_000;
const SKIP_WAITING_FALLBACK_MS = 3000;

type Listener = () => void;
const listeners = new Set<Listener>();
let available = false;
let registration: ServiceWorkerRegistration | null = null;
let lastUpdateCheck = 0;

export function onUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUpdateAvailable(): boolean {
  return available;
}

function notify(): void {
  available = true;
  for (const listener of listeners) listener();
}

/** The version baked into the shell cache this device holds, or null when
 *  there is no shell cache (dev, first visit, unsupported) or when it's
 *  ambiguous — an installed-but-waiting update leaves two xword-shell-*
 *  caches side by side until it activates, and nothing on the page side can
 *  tell which the active worker is serving from. */
export async function getShellVersion(): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const versions = (await caches.keys())
      .filter((k) => k.startsWith(SHELL_PREFIX))
      .map((k) => k.slice(SHELL_PREFIX.length));
    return versions.length === 1 ? versions[0] : null;
  } catch {
    return null;
  }
}

/** Hands control to the waiting worker and reloads once it has taken over.
 *  Flushes debounced progress pushes first so the last edit isn't lost to a
 *  pending timer; the timeout covers a worker that never fires
 *  controllerchange (already activated elsewhere, or an engine that skips
 *  the event) so the button always ends in a reload. */
export function reloadForUpdate(): void {
  flushPendingPushes();
  let refreshing = false;
  const reload = () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  };
  const waiting = registration?.waiting;
  if (!waiting || !("serviceWorker" in navigator)) {
    reload();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
  waiting.postMessage({ type: "SKIP_WAITING" });
  setTimeout(reload, SKIP_WAITING_FALLBACK_MS);
}

/** Asks the browser to re-fetch sw.js and compare bytes. Throttled: iOS fires
 *  visibilitychange on every app switch, and the browser already rate-limits
 *  update checks itself, so hammering it buys nothing. Rejections (offline,
 *  captive portal) are expected and uninteresting. */
function checkForUpdate(): void {
  if (!registration) return;
  const now = Date.now();
  if (now - lastUpdateCheck < UPDATE_CHECK_THROTTLE_MS) return;
  lastUpdateCheck = now;
  registration.update().catch(() => {});
}

/** Registers public/sw.js and watches for a new version reaching "installed"
 *  while an older one is already active — that's a genuine update (as
 *  opposed to the very first install, which has no existing controller and
 *  nothing to prompt about). A worker already waiting when the page loads
 *  (update installed last session, toast never tapped, iOS deferred the
 *  zero-client activation) counts too. Deliberately never calls skipWaiting
 *  on the worker's behalf: swapping cached assets out from under a live
 *  solve could be jarring, so the new version waits for the reload the
 *  toast offers. Skipped entirely in dev — a service worker caching Vite's
 *  dev server would fight its own HMR. */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => {
        registration = reg;
        lastUpdateCheck = Date.now();
        if (reg.waiting && navigator.serviceWorker.controller) notify();
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              notify();
            }
          });
        });
      })
      .catch((err) => console.error("[sw] registration failed", err));
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(checkForUpdate, 1000);
  });
  window.addEventListener("online", checkForUpdate);
}
