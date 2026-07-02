// Publishing/fetching community puzzles (the `puzzles` table) — plain
// wrapper, no-ops if Supabase isn't configured, matching lib/auth.ts.

import { supabase } from "./supabase.ts";
import type { Puzzle } from "../types.ts";
import type { Profile } from "./profile.ts";

export type Visibility = "public" | "mutual" | "unlisted" | "draft";

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Public to followers",
  mutual: "Mutuals only",
  unlisted: "Unlisted",
  draft: "Draft",
};

export interface PublishedPuzzle {
  id: string;
  author_id: string;
  title: string;
  data: Puzzle;
  visibility: Visibility;
  completions: number;
  created_at: string;
}

export async function publishPuzzle(
  authorId: string,
  title: string,
  data: Puzzle,
  visibility: Visibility,
): Promise<{ id: string | null; error: string | null }> {
  if (!supabase) return { id: null, error: "Supabase isn't configured." };
  const { data: row, error } = await supabase
    .from("puzzles")
    .insert({ author_id: authorId, title, data, visibility })
    .select("id")
    .single();
  return { id: row?.id ?? null, error: error?.message ?? null };
}

/** The one path that can return an unlisted puzzle — the caller must
 *  already know its id (an unguessable UUID shared via a direct link). */
export async function getPuzzleById(id: string): Promise<PublishedPuzzle | null> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("get_puzzle_by_id", { p_id: id });
  return data ?? null;
}

/** Puzzles from people `userId` follows — public-from-followed or
 *  mutual-from-mutual (RLS already restricts to exactly that set), newest
 *  first, excluding the viewer's own puzzles. */
export async function listFeed(
  userId: string,
): Promise<(PublishedPuzzle & { author: Profile })[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("puzzles")
    .select("id, author_id, title, data, visibility, completions, created_at")
    .neq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!data || data.length === 0) return [];

  const authorIds = [...new Set(data.map((p) => p.author_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .in("user_id", authorIds);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return data
    .filter((p) => byId.has(p.author_id))
    .map((p) => ({ ...p, author: byId.get(p.author_id)! }) as PublishedPuzzle & { author: Profile });
}

/** Puzzles the given user has published themselves, newest first —
 *  RLS's "own rows" clause means this sees every visibility tier. */
export async function listMyPuzzles(userId: string): Promise<PublishedPuzzle[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("puzzles")
    .select("id, author_id, title, data, visibility, completions, created_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function deletePuzzle(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("puzzles").delete().eq("id", id);
}

/** Updates a puzzle the caller already owns a row for — used both to
 *  re-save a draft in place (no duplicate rows on repeat saves) and to
 *  publish one (flipping its visibility off 'draft' rather than inserting
 *  a second row alongside it). */
export async function updatePuzzle(
  id: string,
  title: string,
  data: Puzzle,
  visibility: Visibility,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase isn't configured." };
  const { error } = await supabase
    .from("puzzles")
    .update({ title, data, visibility })
    .eq("id", id);
  return { error: error?.message ?? null };
}
