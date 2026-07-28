// Copies recent syndicated puzzles from the production project into a
// locally running `supabase start` stack, so multiplayer/two-user testing
// has real puzzles to solve. Read side uses the prod publishable key from
// .env.local (syndicated_puzzles is publicly readable anyway); write side
// uses the local stack's well-known service key — nothing here can touch
// prod data.
//
//   npm run seed:local            # last 14 days
//   npm run seed:local -- 60      # last 60 days
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const prodUrl = process.env.VITE_SUPABASE_URL;
const prodKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!prodUrl || !prodKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
}
if (prodUrl.includes("127.0.0.1") || prodUrl.includes("localhost")) {
  throw new Error(".env.local points at a local URL — expected the production project to copy from.");
}

// The local stack's fixed demo service key (printed by `supabase start`).
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const days = Number(process.argv[2] ?? 14);
const since = new Date(Date.now() - days * 86_400_000);
const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

const prod = createClient(prodUrl, prodKey);
const local = createClient(LOCAL_URL, LOCAL_SERVICE_KEY);

// Full rows, not just `data` — the feed reads real columns (iso_date,
// title, weekday, author, source_priority) that the fetch scripts compute
// in TypeScript; rows without them are invisible to the archive.
const { data, error } = await prod
  .from("syndicated_puzzles")
  .select("source, puzzle_date, data, iso_date, weekday, title, author, source_priority")
  .gte("iso_date", sinceIso);
if (error) throw new Error(`reading prod failed: ${error.message}`);
if (!data?.length) throw new Error(`prod returned no puzzles since ${sinceIso}`);

const { error: writeError } = await local
  .from("syndicated_puzzles")
  .upsert(data, { onConflict: "source,puzzle_date" });
if (writeError) {
  throw new Error(
    `writing to the local stack failed: ${writeError.message}\n` +
      "Is `supabase start` running? If this is a permissions error, the local " +
      "grants fix in supabase/seed.sql hasn't been applied — run `supabase db reset`.",
  );
}

console.log(`Seeded ${data.length} puzzles (since ${sinceIso}) into ${LOCAL_URL}`);
