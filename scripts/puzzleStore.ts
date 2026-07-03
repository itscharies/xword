// Shared write path for every fetch script (and the one-off backfill): every
// syndicated puzzle now lands in the `syndicated_puzzles` table directly
// instead of a public/puzzles/<source>/<date>.json file, so a new puzzle
// shows up live without a git commit + redeploy.
import type { Puzzle } from "../src/types.ts";
import { SOURCE_ORDER, type PuzzleSource } from "../src/lib/sources.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

export function buildSyndicatedRow(source: PuzzleSource, puzzle: Puzzle) {
  return {
    source,
    puzzle_date: puzzle.date,
    iso_date: puzzle.isoDate,
    weekday: puzzle.weekday,
    title: puzzle.title,
    author: puzzle.author,
    // Mirrors SOURCE_ORDER's index — see the migration's comment for why
    // this is computed here rather than re-derived in SQL.
    source_priority: SOURCE_ORDER.indexOf(source),
    data: puzzle,
  };
}

/** Every puzzle_date already stored for a source — lets a fetch script skip
 *  re-scraping (and re-hitting the publisher's site for) a date it already
 *  has, the same way the old on-disk `existsSync` check did. */
export async function existingDates(source: PuzzleSource): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("syndicated_puzzles")
    .select("puzzle_date")
    .eq("source", source);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.puzzle_date as string));
}

export async function saveSyndicatedPuzzle(source: PuzzleSource, puzzle: Puzzle): Promise<void> {
  const { error } = await supabaseAdmin
    .from("syndicated_puzzles")
    .upsert(buildSyndicatedRow(source, puzzle), { onConflict: "source,puzzle_date" });
  if (error) throw error;
}
