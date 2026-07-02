// Plain wrapper over the `profiles` and `follows` tables — no-ops (returning
// empty/neutral results) if Supabase isn't configured, matching lib/auth.ts.

import { supabase } from "./supabase.ts";

export interface Profile {
  user_id: string;
  username: string;
  display_name: string;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** Claim a username + display name for the signed-in user. Fails (returns an
 *  error message) if the username is already taken or malformed — the DB
 *  constraint is the source of truth, this is just a friendlier message. */
export async function claimProfile(
  userId: string,
  username: string,
  displayName: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "Supabase isn't configured." };
  if (!isValidUsername(username)) {
    return { error: "Username must be 3-20 lowercase letters, numbers, or underscores." };
  }
  if (!displayName.trim()) return { error: "Display name can't be empty." };

  const { error } = await supabase
    .from("profiles")
    .insert({ user_id: userId, username, display_name: displayName.trim() });
  if (error?.code === "23505") return { error: "That username is already taken." };
  return { error: error?.message ?? null };
}

/** Usernames (and display names) matching a search prefix, excluding the
 *  searcher themselves. */
export async function searchProfiles(
  query: string,
  excludeUserId: string,
): Promise<Profile[]> {
  if (!supabase || !query.trim()) return [];
  const { data } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .ilike("username", `${query.trim()}%`)
    .neq("user_id", excludeUserId)
    .limit(10);
  return data ?? [];
}

export async function follow(followerId: string, followeeId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("follows").insert({ follower_id: followerId, followee_id: followeeId });
}

export async function unfollow(followerId: string, followeeId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId);
}

/** Profiles of everyone the given user follows. Two queries, not a join —
 *  `follows` references `auth.users` (for cascade-delete), not `profiles`
 *  directly, so PostgREST can't embed across them automatically. */
export async function listFollowing(userId: string): Promise<Profile[]> {
  if (!supabase) return [];
  const { data: edges } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", userId);
  const ids = (edges ?? []).map((e) => e.followee_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .in("user_id", ids);
  return data ?? [];
}
