// Hand-rolled service worker — precaches the built app shell (HTML/JS/CSS/
// fonts + the manifest/home-screen icons) so the app can cold-boot with zero
// connectivity, and otherwise stays out of the way: anything not in the
// precache list (Supabase calls, any other origin) goes straight to the
// network, untouched. Kept as plain, uncompiled JS rather than a Vite entry
// point — a service worker has to be a single static file served from its
// own scope, which doesn't fit Vite/Rollup's normal module graph.
//
// The asset list and version are stamped INTO this file by scripts/build-sw.ts
// (replacing the BUILD line below) rather than fetched from a sidecar
// manifest at install/activate time. That matters twice over: a worker that
// needs the network to learn its own cache name can, after a few rapid
// deploys, activate against a newer manifest and delete the very cache it
// just filled; and a sw.js whose bytes never change is never re-installed by
// the browser, so most deploys would never reach the device at all.
//
// Navigations are cache-first from this worker's own named cache — the shell
// paints instantly whether offline, on a captive portal, or on a slow link;
// new builds arrive via the "update available" toast (src/lib/swUpdate.ts)
// or the next launch with no open clients. The worker never calls
// skipWaiting on its own and never touches the window-owned "xword-puzzles"
// cache (src/lib/cacheStore.ts).

const BUILD = /*@xword-build*/ null;
const SHELL_PREFIX = "xword-shell-";
const SHELL_CACHE = SHELL_PREFIX + (BUILD ? BUILD.version : "unstamped");
// Derived from the script URL, not self.registration.scope — the scope isn't
// reliably populated during the install event in every engine.
const SCOPE = new URL("./", self.location.href).href;
const BASE_PATH = new URL(SCOPE).pathname;
const INDEX_URL = new URL("index.html", SCOPE).href;
const NAV_NETWORK_TIMEOUT_MS = 8000;

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Offline</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #1c1c1c; color: #f2f2f2;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 28rem; margin: 0 auto; padding: 20vh 1.5rem 2rem; text-align: center; }
  button { margin-top: 1.5rem; padding: 0.6rem 1.4rem; border-radius: 999px; border: 1px solid #555;
    background: #2a2a2a; color: inherit; font: inherit; cursor: pointer; }
</style>
</head>
<body>
<main>
  <p>You're offline, and this device hasn't finished saving the app yet. Connect once and reopen it.</p>
  <button type="button" onclick="location.reload()">Retry</button>
</main>
</body>
</html>`;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/** Fills SHELL_CACHE from the network. `cache: "reload"` bypasses the HTTP
 *  cache so a stale CDN/browser copy of index.html can't be precached against
 *  a fresh asset list; the integrity check below catches the case where it
 *  slips through anyway (an index.html referencing hashed chunks this build
 *  doesn't know about would be a shell that can never load offline). */
async function precacheShell() {
  if (!BUILD) throw new Error("sw.js is unstamped — run scripts/build-sw.ts");
  const cache = await caches.open(SHELL_CACHE);
  let html = null;
  for (const path of BUILD.assets) {
    const url = new URL(path, SCOPE).href;
    const res = await fetch(new Request(url, { cache: "reload" }));
    if (!res.ok) throw new Error(`precache ${path}: HTTP ${res.status}`);
    if (url === INDEX_URL) html = await res.clone().text();
    await cache.put(url, res);
  }
  if (html !== null) {
    const known = new Set(BUILD.assets);
    for (const m of html.matchAll(new RegExp(escapeRe(BASE_PATH) + "(assets/[^\"' )]+)", "g"))) {
      if (!known.has(m[1])) {
        await caches.delete(SHELL_CACHE);
        throw new Error(`precache integrity: index.html references ${m[1]}, not in this build`);
      }
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

// No network here: the cache name is baked in, so activating offline (e.g. a
// Reload tapped on the update toast after Wi-Fi dropped) still works. The
// index.html check guards against clearing other shells when our own install
// somehow left nothing usable behind.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const ownIndex = await cache.match(INDEX_URL, { ignoreVary: true });
      if (ownIndex) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith(SHELL_PREFIX) && k !== SHELL_CACHE).map((k) => caches.delete(k)),
        );
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept a mutating request

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase etc. — network only
  if (url.pathname.includes("/__offline/")) return; // window-owned puzzle store

  // A page navigation (opening/reloading a route, deep-linked or not). The
  // client-side router (App.tsx) reads window.location.pathname itself once
  // the shell loads, so serving index.html for any extensionless path under
  // this scope is enough to get a deep link (e.g. /xword/nyt/20260919)
  // rendering offline. A cache miss means the shell was evicted: go to the
  // network (bounded, so "connected but no internet" can't hang on a blank
  // tab), re-precache in the background, and show an inline offline page
  // rather than a browser error if that fails too.
  if (request.mode === "navigate" && !/\.[a-z0-9]{1,8}$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(SHELL_CACHE);
          const hit = await cache.match(INDEX_URL, { ignoreVary: true });
          if (hit) return hit;
          const refill = precacheShell().catch(() => {});
          try {
            event.waitUntil(refill);
          } catch {
            /* fire-and-forget */
          }
          return await fetchWithTimeout(request, NAV_NETWORK_TIMEOUT_MS);
        } catch {
          return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Everything else that's same-origin: cache-first from this worker's own
  // cache (hashed filenames never change content, so nothing to revalidate),
  // falling back to network for anything not precached. Deliberately not a
  // global caches.match — that could serve another version's asset. ignoreVary
  // matters: a Vary header on the response cached at install time can
  // otherwise make an identical later request look like a miss and fall
  // through to a network fetch guaranteed to fail offline.
  event.respondWith(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.match(request, { ignoreVary: true }))
      .then((hit) => hit || fetch(request)),
  );
});
