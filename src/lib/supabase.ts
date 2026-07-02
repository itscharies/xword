// The Supabase client. Solving never requires an account — every module that
// talks to Supabase must check `supabaseEnabled` and no-op if it's false, so
// a build without these env vars still works as pure-localStorage.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnabled = Boolean(url && publishableKey);

export const supabase = supabaseEnabled
  ? createClient(url, publishableKey)
  : null;
