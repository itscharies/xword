// Hand-rolled service worker — precaches the built app shell (HTML/JS/CSS +
// the manifest/home-screen icons) so the app can cold-boot with zero
// connectivity, and otherwise stays out of the way: anything not in the
// precache list (Supabase calls, any other origin) goes straight to the
// network, untouched. Kept as plain, uncompiled JS rather than a Vite entry
// point — a service worker has to be a single static file served from its
// own scope, which doesn't fit Vite/Rollup's normal module graph.
//
// See scripts/build-sw-manifest.ts for how dist/sw-manifest.json (the asset
// list + version this worker reads) is generated at build time, and
// src/lib/swUpdate.ts for the client-side registration + "update available"
// flow this deliberately leaves to the page rather than forcing itself in
// with skipWaiting/clients.claim.

const MANIFEST_URL = "./sw-manifest.json";
const CACHE_PREFIX = "xword-shell-";

// The app's actual typefaces (SN Pro, Jaro) come from Google Fonts, not this
// origin — index.html loads them straight from fonts.googleapis.com/
// fonts.gstatic.com. They can't be listed in the precache manifest (the
// gstatic file URLs are generated per-request, keyed off the requesting
// browser's Accept header, so there's no fixed set to know at build time),
// so instead they're cached the first time they're actually requested (any
// online visit) and served from that cache on every later request,
// including offline ones.
const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];
const FONT_CACHE = "xword-fonts";

async function loadManifest() {
  // no-store: this file itself is tiny and must never come from the HTTP
  // cache, or a re-deploy with an unchanged sw.js could keep installing an
  // old asset list forever.
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  return res.json();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const { version, assets } = await loadManifest();
      const cache = await caches.open(CACHE_PREFIX + version);
      await cache.addAll(assets.map((path) => new URL(path, self.registration.scope).toString()));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const { version } = await loadManifest();
      const current = CACHE_PREFIX + version;
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== current).map((key) => caches.delete(key)),
      );
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept a mutating request

  const url = new URL(request.url);

  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FONT_CACHE);
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        try {
          const res = await fetch(request);
          // Cache a clone regardless of exact status — Google Fonts' CSS
          // responses are effectively immutable per URL, so there's nothing
          // to revalidate later.
          if (res.ok) event.waitUntil(cache.put(request, res.clone()));
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // Supabase etc. — network only

  // A page navigation (opening/reloading a route, deep-linked or not) — try
  // the network first so a live puzzle fetch and a signed-in session stay
  // fresh, and only fall back to the cached shell when that fails. The
  // client-side router (App.tsx) reads window.location.pathname itself once
  // the shell loads, so serving index.html for any path under this scope is
  // enough to get a deep link (e.g. /xword/nyt/20260919) rendering offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match("./index.html", { ignoreVary: true })) || Response.error(),
      ),
    );
    return;
  }

  // Everything else that's same-origin: cache-first (the precached shell's
  // hashed filenames never change content, so there's nothing to revalidate)
  // falling back to network for anything not in the manifest. ignoreVary
  // matters here: a Vary header on the original (cached-at-install-time)
  // response can otherwise make an identical later request look like a
  // miss, which would silently fall through to a network fetch that's
  // guaranteed to fail while offline even though the asset is sitting right
  // there in the cache.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => cached || fetch(request)),
  );
});
