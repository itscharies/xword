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

export async function signInWithOtp(
  email: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase isn't configured." };
  const { error } = await supabase.auth.signInWithOtp({ email });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export { supabaseEnabled };
