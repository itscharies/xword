// Publishing/fetching community puzzles (the `puzzles` table) — plain
// wrapper, no-ops if Supabase isn't configured, matching lib/auth.ts.

import { supabase } from "./supabase.ts";
import type { Puzzle, PuzzleType } from "../types.ts";
import type { Profile } from "./profile.ts";
import type { PuzzleSource } from "./sources.ts";
import type { AccentId } from "./theme.ts";

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
  /** Community only — the puzzle's type for the feed's Type filter, from
   *  the author's explicit pick or derived from the grid size / cryptic
   *  flag by community_puzzle_type() server-side. Syndicated items carry
   *  null and derive theirs from SOURCES[source].type instead. */
  type: PuzzleType | null;
  completions: number;
  /** Mutuals' progress on this puzzle, projected onto the feed query. */
  mutualProgress: MutualProgress[];
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
  puzzle_type: string | null;
  mutual_progress: MutualProgress[] | null;
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

/** Today's date in the viewer's own timezone, as YYYY-MM-DD — deliberately
 *  not `toISOString()`, which reports UTC and would reintroduce the same
 *  lag `p_viewer_date` exists to avoid. */
export function localIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** One page of the merged home feed (syndicated + community puzzles),
 *  newest first, with same-day community puzzles sorted ahead of syndicated
 *  ones. `includeFollowing = false` drops community puzzles from the feed
 *  entirely rather than just hiding them client-side, so pages stay full —
 *  see `list_archive_feed`'s migration comment for why that matters.
 *  `includeMine` does the same for the viewer's own published puzzles. */
export async function listArchivePage(opts: {
  cursor?: string | null;
  pageSize?: number;
  includeFollowing?: boolean;
  includeMine?: boolean;
} = {}): Promise<{ items: ArchiveFeedItem[]; nextCursor: string | null }> {
  if (!supabase) return { items: [], nextCursor: null };
  const { cursor = null, pageSize = 24, includeFollowing = true, includeMine = true } = opts;
  const c = cursor ? decodeCursor(cursor) : null;

  const { data, error } = await supabase.rpc("list_archive_feed", {
    p_include_following: includeFollowing,
    p_include_mine: includeMine,
    p_cursor_neg_date: c?.negDate ?? null,
    p_cursor_kind: c?.kind ?? null,
    p_cursor_tie: c?.tie ?? null,
    p_cursor_id: c?.itemId ?? null,
    p_page_size: pageSize,
    // The DB's own current_date runs in UTC, which lags a viewer ahead of
    // UTC (e.g. AEST) by up to 11 hours — send their local date instead, so
    // a puzzle dated for their "today" isn't hidden until UTC catches up.
    p_viewer_date: localIsoDate(),
  });
  if (error) {
    console.error("[archive] listArchivePage failed", error);
    return { items: [], nextCursor: null };
  }
  const rows = (data ?? []) as RawFeedRow[];

  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))];
  const { data: profiles } =
    authorIds.length > 0
      ? await supabase.from("profiles").select("user_id, username, display_name, accent").in("user_id", authorIds)
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
    type: r.kind === 0 ? ((r.puzzle_type as PuzzleType) ?? "regular") : null,
    completions: r.completions ?? 0,
    mutualProgress: r.mutual_progress ?? [],
  }));

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === pageSize && last ? encodeCursor(last) : null;

  return { items, nextCursor };
}

/** One mutual's progress summary on a puzzle — what the solves projection
 *  returns per row. Only the summary: their actual grid entries never leave
 *  the server. */
export interface MutualProgress {
  user_id: string;
  username: string;
  display_name: string;
  accent: AccentId;
  completed: boolean;
  filled: number;
  total: number;
  updated_at: string;
}

/** A published puzzle plus the viewer's mutuals' progress on it, projected
 *  onto the same fetch — one round-trip, so the solves segment renders with
 *  the puzzle instead of popping in after it. Same reachability rules as
 *  getPuzzleById (it wraps it server-side). */
export async function getPuzzleWithSolves(
  id: string,
): Promise<{ puzzle: PublishedPuzzle; mutualProgress: MutualProgress[] } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_puzzle_with_solves", { p_id: id });
  if (error) {
    console.error("[puzzles] getPuzzleWithSolves failed", error);
    return null;
  }
  if (!data) return null;
  const row = data as { puzzle: PublishedPuzzle; mutual_progress: MutualProgress[] };
  return { puzzle: row.puzzle, mutualProgress: row.mutual_progress ?? [] };
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
