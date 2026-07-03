// Publishing/fetching community puzzles (the `puzzles` table) — plain
// wrapper, no-ops if Supabase isn't configured, matching lib/auth.ts.

import { supabase } from "./supabase.ts";
import type { Puzzle } from "../types.ts";
import type { Profile } from "./profile.ts";
import type { PuzzleSource } from "./sources.ts";

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

/** One item in the merged, paginated home feed — either a syndicated
 *  puzzle or a community/authored one, normalized to a common shape so the
 *  archive can render + sort them together instead of as separate lists. */
export interface ArchiveFeedItem {
  kind: "community" | "syndicated";
  /** Community: the puzzle's uuid. Syndicated: "<source>:<puzzle_date>". */
  id: string;
  isoDate: string;
  title: string;
  /** Syndicated only. */
  source: PuzzleSource | null;
  puzzleDate: string | null;
  weekday: string | null;
  /** Syndicated only — plain byline text (no user account behind it). */
  author: string | null;
  /** Community only — hydrated from `profiles` after the feed query. */
  authorProfile: Profile | null;
  completions: number;
}

interface RawFeedRow {
  kind: number;
  item_id: string;
  iso_date: string;
  title: string;
  source: string | null;
  weekday: string | null;
  author: string | null;
  author_id: string | null;
  completions: number | null;
  neg_date: number;
  tie: number;
}

/** The four scalar keyset-pagination params `list_archive_feed` needs to
 *  resume after a given row — see the SQL function for why they're a tuple
 *  rather than a single opaque offset. */
interface ArchiveCursor {
  negDate: number;
  kind: number;
  tie: number;
  itemId: string;
}

function encodeCursor(row: RawFeedRow): string {
  const c: ArchiveCursor = { negDate: row.neg_date, kind: row.kind, tie: row.tie, itemId: row.item_id };
  return btoa(JSON.stringify(c));
}

function decodeCursor(cursor: string): ArchiveCursor {
  return JSON.parse(atob(cursor));
}

/** One page of the merged home feed (syndicated + community puzzles),
 *  newest first, with same-day community puzzles sorted ahead of syndicated
 *  ones. `includeFollowing = false` drops community puzzles from the feed
 *  entirely rather than just hiding them client-side, so pages stay full —
 *  see `list_archive_feed`'s migration comment for why that matters. */
export async function listArchivePage(opts: {
  cursor?: string | null;
  pageSize?: number;
  includeFollowing?: boolean;
} = {}): Promise<{ items: ArchiveFeedItem[]; nextCursor: string | null }> {
  if (!supabase) return { items: [], nextCursor: null };
  const { cursor = null, pageSize = 24, includeFollowing = true } = opts;
  const c = cursor ? decodeCursor(cursor) : null;

  const { data, error } = await supabase.rpc("list_archive_feed", {
    p_include_following: includeFollowing,
    p_cursor_neg_date: c?.negDate ?? null,
    p_cursor_kind: c?.kind ?? null,
    p_cursor_tie: c?.tie ?? null,
    p_cursor_id: c?.itemId ?? null,
    p_page_size: pageSize,
  });
  if (error) {
    console.error("[archive] listArchivePage failed", error);
    return { items: [], nextCursor: null };
  }
  const rows = (data ?? []) as RawFeedRow[];

  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))];
  const { data: profiles } =
    authorIds.length > 0
      ? await supabase.from("profiles").select("user_id, username, display_name").in("user_id", authorIds)
      : { data: [] as Profile[] };
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const items: ArchiveFeedItem[] = rows.map((r) => ({
    kind: r.kind === 0 ? "community" : "syndicated",
    id: r.item_id,
    isoDate: r.iso_date,
    title: r.title,
    source: (r.source as PuzzleSource) ?? null,
    puzzleDate: r.kind === 1 ? r.item_id.split(":")[1] : null,
    weekday: r.weekday,
    author: r.author,
    authorProfile: r.author_id ? (byId.get(r.author_id) ?? null) : null,
    completions: r.completions ?? 0,
  }));

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === pageSize && last ? encodeCursor(last) : null;

  return { items, nextCursor };
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
