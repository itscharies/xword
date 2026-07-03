// Plain (non-React) wrapper around Supabase auth — no-ops if Supabase isn't
// configured, so callers never need to check `supabaseEnabled` themselves.

import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "./supabase.ts";

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(
  cb: (session: Session | null) => void,
): () => void {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => subscription.unsubscribe();
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
