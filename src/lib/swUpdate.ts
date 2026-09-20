// Service worker registration and the "a new version is ready" pub-sub
// consumed by components/UpdateToast.tsx. See public/sw.js for the precache
// logic this manages the client side of, and scripts/build-sw-manifest.ts
// for how the precache list itself is generated at build time.

type Listener = () => void;
const listeners = new Set<Listener>();
let available = false;

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

export function reloadForUpdate(): void {
  window.location.reload();
}

/** Registers public/sw.js and watches for a new version reaching "installed"
 *  while an older one is already active — that's a genuine update (as
 *  opposed to the very first install, which has no existing controller and
 *  nothing to prompt about). Deliberately never calls skipWaiting/
 *  clients.claim on the worker's behalf: swapping cached assets out from
 *  under a live solve could be jarring, so the new version just waits for
 *  the reload the toast offers. Skipped entirely in dev — a service worker
 *  caching Vite's dev server would fight its own HMR. */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
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
}
