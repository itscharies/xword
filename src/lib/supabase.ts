// The Supabase client. Solving never requires an account — every module that
// talks to Supabase must check `supabaseEnabled` and no-op if it's false, so
// a build without these env vars still works as pure-localStorage.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnabled = Boolean(url && publishableKey);

// `keepalive` lets a progress-save request already in flight finish even
// after the tab starts unloading, instead of the browser cancelling it
// mid-request when the page is torn down — but browsers cap total in-flight
// keepalive bytes (Chrome: 64 KiB) for the page's whole lifetime, and every
// request past that cap fails outright. Setting it unconditionally on every
// Supabase call (most of which have nothing to do with unloading) burns down
// that budget over a long session and can start silently failing saves.
// Only flip it on while the tab is actually going away.
let leaving = false;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    leaving = document.visibilityState === "hidden";
  });
  window.addEventListener("pagehide", () => {
    leaving = true;
  });
}

export const supabase = supabaseEnabled
  ? createClient(url, publishableKey, {
      global: { fetch: (input, init) => fetch(input, { ...init, keepalive: leaving }) },
    })
  : null;
