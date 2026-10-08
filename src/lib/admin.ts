// Admin-only reads for the /admin stats page. Every call goes through a
// SECURITY DEFINER rpc that refuses non-admins server-side (see
// supabase/migrations/20261008000000_admin_stats.sql) — the client-side
// is_admin check on the page is only there to avoid a pointless request.

import { supabase } from "./supabase.ts";
import type { AccentId } from "./theme.ts";
import type { Visibility } from "./puzzles.ts";

export interface UserRef {
  user_id: string;
  username: string;
  display_name: string;
  accent: AccentId;
}

export interface DailyPoint {
  day: string; // YYYY-MM-DD (UTC)
  signups: number;
  active: number;
  completed: number;
}

export interface AdminOverview {
  generated_at: string;
  users: {
    total: number;
    new_7d: number;
    new_30d: number;
    unclaimed: number;
    active_1d: number;
    active_7d: number;
    active_30d: number;
    admins: number;
  };
  solving: {
    started: number;
    completed: number;
    completed_7d: number;
    completed_30d: number;
    median_seconds: number | null;
    clean: number;
    avg_rating: number | null;
  };
  community: {
    public: number;
    mutual: number;
    unlisted: number;
    draft: number;
    authors: number;
    new_30d: number;
    completions: number;
  };
  social: {
    follows: number;
    mutual_pairs: number;
    following_anyone: number;
    new_30d: number;
  };
  coop: {
    sessions: number;
    completed: number;
    open: number;
    sessions_30d: number;
    avg_players: number | null;
    messages: number;
  };
  daily: DailyPoint[];
  sources: {
    source: string;
    started: number;
    completed: number;
    solvers: number;
    median_seconds: number | null;
    avg_rating: number | null;
  }[];
  top_puzzles: {
    id: string;
    title: string;
    visibility: Visibility;
    completions: number;
    created_at: string;
    author_username: string | null;
    author_display_name: string | null;
  }[];
  most_followed: (UserRef & { followers: number })[];
  top_solvers_30d: (UserRef & { completed: number })[];
}

export interface AdminUserRow extends UserRef {
  is_admin: boolean;
  email: string | null;
  created_at: string;
  last_active_at: string | null;
  solved: number;
  following: number;
  followers: number;
  puzzles: number;
}

export interface AdminSolve {
  source: string | null;
  puzzle_date: string | null;
  puzzle_id: string | null;
  title: string | null;
  updated_at: string;
  completed_at: string | null;
  elapsed: number | null;
  filled: number | null;
  total: number | null;
  revealed: number;
  rating: number | null;
}

export interface AdminUserDetail {
  profile: UserRef & {
    is_admin: boolean;
    created_at: string;
    email: string | null;
    signed_up_at: string | null;
    last_sign_in_at: string | null;
    provider: string | null;
    last_active_at: string | null;
  };
  stats: {
    started: number;
    completed: number;
    completed_30d: number;
    clean: number;
    median_seconds: number | null;
    total_seconds: number;
    avg_rating: number | null;
    sessions: number;
    messages: number;
    active_days_30d: number;
  };
  sources: { source: string; started: number; completed: number }[];
  following: (UserRef & { followed_at: string; mutual: boolean })[];
  followers: (UserRef & { followed_at: string; mutual: boolean })[];
  puzzles: {
    id: string;
    title: string;
    visibility: Visibility;
    completions: number;
    created_at: string;
    width: number | null;
    height: number | null;
    solvers: number;
  }[];
  solves: AdminSolve[];
  sessions: {
    id: string;
    status: string;
    source: string | null;
    puzzle_date: string | null;
    puzzle_id: string | null;
    title: string | null;
    created_at: string;
    completed_at: string | null;
    players: number;
    messages: number;
  }[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!supabase) throw new Error("Supabase isn't configured.");
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  return data as AdminOverview;
}

export async function searchAdminUsers(query: string, limit = 50): Promise<AdminUserRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("admin_search_users", {
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}

/** Null when no profile has that username. */
export async function getAdminUserDetail(username: string): Promise<AdminUserDetail | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("admin_user_detail", { p_username: username });
  if (error) throw error;
  return (data ?? null) as AdminUserDetail | null;
}
