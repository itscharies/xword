// Syndicated puzzles' canonical database copy. New syndication (or an admin
// fixing bad parsing) writes here instead of a static public/puzzles/*.json
// file, so it doesn't need a deploy — App.tsx's fetchSyndicatedPuzzle checks
// here first and only falls back to the static file for puzzles never
// touched since this table was introduced.

import { supabase } from "./supabase.ts";
import type { Puzzle } from "../types.ts";
import type { PuzzleSource } from "./sources.ts";
import type { MutualProgress } from "./puzzles.ts";

export async function getSyndicatedPuzzle(
  source: PuzzleSource,
  date: string,
): Promise<Puzzle | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("syndicated_puzzles")
    .select("data")
    .eq("source", source)
    .eq("puzzle_date", date)
    .maybeSingle();
  return data?.data ?? null;
}

/** The solver-page variant of getSyndicatedPuzzle: the viewer's mutuals'
 *  progress comes back projected onto the same fetch — one round-trip, so
 *  the solves segment renders with the puzzle instead of popping in after
 *  it. (The Builder's edit path keeps the plain fetch above.) */
export async function getSyndicatedWithSolves(
  source: PuzzleSource,
  date: string,
): Promise<{ puzzle: Puzzle; mutualProgress: MutualProgress[] } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_syndicated_with_solves", {
    p_source: source,
    p_puzzle_date: date,
  });
  if (error) {
    console.error("[syndicated] getSyndicatedWithSolves failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as { puzzle: Puzzle; mutual_progress: MutualProgress[] };
  return { puzzle: row.puzzle, mutualProgress: row.mutual_progress ?? [] };
}

export async function saveSyndicatedPuzzle(
  source: PuzzleSource,
  date: string,
  puzzle: Puzzle,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase isn't configured." };
  const { error } = await supabase
    .from("syndicated_puzzles")
    .upsert({ source, puzzle_date: date, data: puzzle }, { onConflict: "source,puzzle_date" });
  return { error: error?.message ?? null };
}
