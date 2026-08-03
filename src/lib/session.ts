// Plain wrapper over the `sessions` / `session_participants` tables and
// their RPCs — the durable side of multiplayer co-op solving. No-ops when
// Supabase isn't configured, matching lib/auth.ts. The live sync layer
// (broadcast channel, merge) lives in lib/coop.ts.

import { supabase, supabaseEnabled } from "./supabase.ts";
import type { Puzzle } from "../types.ts";
import type { PuzzleSource } from "./sources.ts";
import type { SessionState } from "./coop.ts";
import type { AccentId } from "./theme.ts";
import { applyEnumerationBars } from "./enumeration.ts";

// The mock backend is an in-memory, per-tab database — two tabs can't share
// a session's state, so "multiplayer" there would be structurally
// meaningless. Gate the feature off rather than stubbing channels.
const MOCK_MODE = import.meta.env.VITE_MOCK_BACKEND === "1";
export const sessionsEnabled = supabaseEnabled && !MOCK_MODE;

export type SessionStatus = "open" | "completed" | "ended";

export interface SessionRow {
  id: string;
  created_by: string;
  status: SessionStatus;
  source: PuzzleSource | null;
  puzzle_date: string | null;
  puzzle_id: string | null;
  state: SessionState;
  state_version: number;
  created_at: string;
  completed_at: string | null;
  last_activity_at: string;
}

export interface SessionParticipant {
  user_id: string;
  username: string;
  display_name: string;
  accent?: AccentId | null;
  joined_at: string;
}

export interface JoinResult {
  session: SessionRow;
  puzzle: Puzzle;
  participants: SessionParticipant[];
  /** DB now() at join — corrects the shared clock for local clock skew. */
  server_time: string;
}

export interface SessionPreview {
  status: SessionStatus;
  title: string | null;
  source: PuzzleSource | null;
  puzzle_date: string | null;
  puzzle_id: string | null;
  created_by: string;
  is_participant: boolean;
  participants: { user_id: string; username: string; display_name: string; accent?: AccentId | null }[];
}

export type SessionPuzzleRef =
  | { source: PuzzleSource; date: string }
  | { puzzleId: string };

export async function createSession(
  ref: SessionPuzzleRef,
  initialState: SessionState,
): Promise<{ id: string | null; error: string | null }> {
  if (!supabase || !sessionsEnabled) return { id: null, error: "Sessions aren't available." };
  const { data, error } = await supabase.rpc("create_session", {
    p_source: "source" in ref ? ref.source : null,
    p_puzzle_date: "source" in ref ? ref.date : null,
    p_puzzle_id: "puzzleId" in ref ? ref.puzzleId : null,
    p_state: initialState,
  });
  return { id: (data as string | null) ?? null, error: error?.message ?? null };
}

export async function joinSession(id: string): Promise<JoinResult | null> {
  if (!supabase || !sessionsEnabled) return null;
  const { data, error } = await supabase.rpc("join_session", { p_id: id });
  if (error) {
    console.error("[session] join failed", error);
    return null;
  }
  if (!data) return null;
  const res = data as JoinResult;
  // Matches the solo fetch paths: syndicated puzzles get enumeration bars
  // derived; community puzzles are shown as authored.
  if (res.session.source) applyEnumerationBars(res.puzzle);
  return res;
}

export async function getSessionPreview(id: string): Promise<SessionPreview | null> {
  if (!supabase || !sessionsEnabled) return null;
  const { data, error } = await supabase.rpc("get_session_preview", { p_id: id });
  if (error) {
    console.error("[session] preview failed", error);
    return null;
  }
  return (data as SessionPreview | null) ?? null;
}

/** Guarded last-write-wins snapshot write; piggybacks the activity touch.
 *  The `state_version < versionMs` filter means an older snapshot can never
 *  clobber a newer one — matching zero rows is fine, someone fresher wrote. */
export function pushSessionState(id: string, state: SessionState, versionMs: number): void {
  if (!supabase || !sessionsEnabled) return;
  void supabase
    .from("sessions")
    .update({
      state,
      state_version: versionMs,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id)
    .lt("state_version", versionMs)
    .then(({ error }) => {
      if (error) console.error("[session] snapshot push failed", error);
    });
}

export function touchSession(id: string): void {
  if (!supabase || !sessionsEnabled) return;
  void supabase
    .from("sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", id)
    .then(({ error }) => {
      if (error) console.error("[session] activity touch failed", error);
    });
}

/** First completion wins: the status filter makes the race idempotent, and
 *  the DB trigger stamps completed_at so everyone shows the same time. */
export async function completeSession(
  id: string,
  state: SessionState,
  versionMs: number,
): Promise<void> {
  if (!supabase || !sessionsEnabled) return;
  const { error } = await supabase
    .from("sessions")
    .update({ status: "completed", state, state_version: versionMs })
    .eq("id", id)
    .eq("status", "open");
  if (error) console.error("[session] complete failed", error);
}

export async function endSession(id: string): Promise<void> {
  if (!supabase || !sessionsEnabled) return;
  const { error } = await supabase
    .from("sessions")
    .update({ status: "ended" })
    .eq("id", id)
    .eq("status", "open");
  if (error) console.error("[session] end failed", error);
}

/** Lightweight row re-read — reconnect resync and the periodic staleness
 *  check both use it (participants-only under RLS, which the caller is by
 *  the time this runs). */
export async function fetchSessionRow(id: string): Promise<SessionRow | null> {
  if (!supabase || !sessionsEnabled) return null;
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[session] fetch failed", error);
    return null;
  }
  return (data as SessionRow | null) ?? null;
}
