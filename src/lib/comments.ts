// Plain wrapper over the `session_comments` table — a session-wide, append-
// only chat log for a co-op session. No-ops when sessions aren't available,
// matching lib/session.ts (comments have no meaning without a session).

import { supabase } from "./supabase.ts";
import { sessionsEnabled } from "./session.ts";

export interface SessionComment {
  id: string;
  session_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export async function listComments(sessionId: string): Promise<SessionComment[]> {
  if (!supabase || !sessionsEnabled) return [];
  const { data, error } = await supabase
    .from("session_comments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[comments] list failed", error);
    return [];
  }
  return (data as SessionComment[]) ?? [];
}

export async function createComment(args: {
  sessionId: string;
  authorId: string;
  body: string;
}): Promise<SessionComment | null> {
  if (!supabase || !sessionsEnabled) return null;
  const body = args.body.trim().slice(0, 500);
  if (!body) return null;
  const { data, error } = await supabase
    .from("session_comments")
    .insert({ session_id: args.sessionId, author_id: args.authorId, body })
    .select()
    .single();
  if (error) {
    console.error("[comments] create failed", error);
    return null;
  }
  return data as SessionComment;
}
