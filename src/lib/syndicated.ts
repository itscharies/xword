// Syndicated puzzles' canonical database copy. New syndication (or an admin
// fixing bad parsing) writes here instead of a static public/puzzles/*.json
// file, so it doesn't need a deploy — App.tsx's fetchSyndicatedPuzzle checks
// here first and only falls back to the static file for puzzles never
// touched since this table was introduced.

import { supabase } from "./supabase.ts";
import type { Puzzle } from "../types.ts";
import type { PuzzleSource } from "./sources.ts";

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
