// Where the (retired) static puzzle catalogue lives on disk. Puzzles
// themselves now live in the `syndicated_puzzles` table (see
// scripts/puzzleStore.ts) — this constant only remains so the one-off
// backfill script (scripts/migrate-puzzles-to-supabase.ts) can still find
// the files it's importing from.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PUZZLE_DIR = join(__dirname, "..", "public", "puzzles");
