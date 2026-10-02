// Plain (non-React) wrapper around Supabase auth — no-ops if Supabase isn't
// configured, so callers never need to check `supabaseEnabled` themselves.

import { isAuthRetryableFetchError, type AuthChangeEvent, type Session, type User } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "./supabase.ts";

/** `retryable` is set when the session came back null only because the
 *  stored token had expired and the refresh couldn't reach the network —
 *  the user is still signed in as far as this device knows, and auth-js
 *  will refresh on reconnect. A caller treating that null as "signed out"
 *  would log the user out of the UI every time the phone goes offline for
 *  more than the token's hour. */
export async function getSession(): Promise<{ session: Session | null; retryable: boolean }> {
  if (!supabase) return { session: null, retryable: false };
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, retryable: isAuthRetryableFetchError(error) };
}

export function onAuthStateChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => subscription.unsubscribe();
}

/** The user from auth-js's own persisted session (`sb-<ref>-auth-token`),
 *  read synchronously — so the first paint after an offline relaunch can
 *  show the signed-in header instead of waiting ~25 s for the refresh retry
 *  loop to give up. Purely a seed; `getSession`/`onAuthStateChange` remain
 *  the authority and correct it. */
export function readStoredUser(): User | null {
  if (!supabase) return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      const user = (parsed as { user?: User | null } | null)?.user;
      if (user && typeof user === "object" && typeof user.id === "string") return user;
    }
  } catch {
    // Unreadable storage or a foreign value under the key — fall through to
    // the async path, which handles it.
  }
  return null;
}

/** Redirects the whole page to Google, then back here. Without an explicit
 *  redirectTo, Supabase sends the browser back to its configured Site URL
 *  (production) instead of wherever this was actually opened from — so on
 *  localhost that silently bounces you to the live site. */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase isn't configured." };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export { supabaseEnabled };
