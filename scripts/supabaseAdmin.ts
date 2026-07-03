// Service-role Supabase client for one-off/CI scripts (the backfill and the
// daily fetchers) that need to write to tables RLS otherwise locks down to
// admins — never imported by the browser bundle.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set them in .env.local " +
      "(local) or as repo secrets (CI). The service role key is in your Supabase " +
      "project's API settings; never expose it to the browser (it bypasses RLS).",
  );
}

export const supabaseAdmin = createClient(url, serviceRoleKey);
