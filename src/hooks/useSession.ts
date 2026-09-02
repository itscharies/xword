// Binds a co-op session (lib/coop.ts + lib/session.ts) to the solve engine
// and the Solver's UI. Called unconditionally (hooks rule) — `join` is null
// outside session mode and everything inside no-ops.

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CellCommitCause,
  CellCommitDelta,
  Crossword,
  MarkCommitDelta,
} from "./useCrossword.ts";
import {
  CoopClient,
  SESSION_IDLE_MS,
  type PeerMeta,
  type RemoteCursorState,
  type WireComment,
  type WireOp,
} from "../lib/coop.ts";
import {
  completeSession,
  endSession,
  fetchSessionRow,
  pushSessionState,
  touchSession,
  type JoinResult,
  type SessionParticipant,
  type SessionStatus,
} from "../lib/session.ts";
import { createComment, listComments, type SessionComment } from "../lib/comments.ts";
import { accentSwatch } from "../lib/theme.ts";
import type { Direction } from "../types.ts";

function commentToWire(row: SessionComment): WireComment {
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function commentFromWire(msg: WireComment, sessionId: string): SessionComment {
  return {
    id: msg.id,
    session_id: sessionId,
    author_id: msg.authorId,
    body: msg.body,
    created_at: msg.createdAt,
  };
}

const BASE = import.meta.env.BASE_URL;

export interface RemoteCursor {
  sid: string;
  userId: string;
  username: string;
  displayName: string;
  row: number;
  col: number;
  /** Which way they're solving — the grid tints their whole selected word. */
  direction: Direction;
  /** The user's avatar accent — "the colour of their profile picture". */
  color: string;
  /** First letter of their display name, badged on the cursor cell so two
   *  players who hash to the same accent stay tellable apart. */
  letter: string;
}

/** The clue a remote cursor is sitting on. The sender normalizes direction
 *  to a word that runs through their cell, but fall back to the cross word
 *  rather than trust that blindly. Shared by the grid (word tint) and the
 *  clue list (row highlight) so both agree on what a peer "has selected". */
export function cursorClue(xw: Crossword, cur: RemoteCursor) {
  return (
    xw.clueAt(cur.row, cur.col, cur.direction) ??
    xw.clueAt(cur.row, cur.col, cur.direction === "across" ? "down" : "across")
  );
}

export type SessionNotice =
  | { id: number; kind: "text"; text: string; leaving?: boolean }
  | { id: number; kind: "comment"; authorId: string; body: string; leaving?: boolean };

/** Solver passes stable closures into useCrossword that forward through
 *  this ref; useSession fills the handlers in once the client exists. */
export interface CoopBridge {
  onCells?: (commit: { cells: CellCommitDelta[]; cause: CellCommitCause }) => void;
  onMarks?: (commit: { marks: MarkCommitDelta[] }) => void;
}

export interface SessionApi {
  status: SessionStatus;
  /** Durable roster (grows as presence reveals new joiners). */
  participants: SessionParticipant[];
  /** User ids with at least one live tab right now. */
  online: Set<string>;
  cursors: RemoteCursor[];
  notices: SessionNotice[];
  /** Shared wall clock: seconds since the session was created, identical
   *  for every participant, frozen at completion. */
  elapsed: number;
  ended: boolean;
  inviteUrl: string;
  /** The session's whole chat log, chronological — global, not per-clue;
   *  append-only, no edit or delete. */
  comments: SessionComment[];
  postComment: (body: string) => Promise<void>;
}

const NOTICE_TTL_MS = 4000;
const ENDED_CHECK_MS = 60_000;

/** Accents are non-null on every profile, so this only covers presence
 *  payloads from clients on builds that predate the accent field. */
const FALLBACK_ACCENT = "yellow" as const;

export function useSession(
  join: JoinResult | null,
  xw: Crossword,
  user: User | null,
  bridge: MutableRefObject<CoopBridge>,
): SessionApi | null {
  const sessionId = join?.session.id ?? null;

  // The engine handle changes identity every render; callbacks read through
  // a ref so the client (created once) always sees the live one.
  const xwRef = useRef(xw);
  xwRef.current = xw;

  const clientRef = useRef<CoopClient | null>(null);
  const peersBySidRef = useRef(new Map<string, PeerMeta>());
  const noticeIdRef = useRef(0);

  // Local-clock minus server-clock, captured once at join — the shared
  // clock renders in the server's time domain so skewed devices agree.
  const skewRef = useRef<number | null>(null);
  if (join && skewRef.current === null) {
    skewRef.current = Date.now() - Date.parse(join.server_time);
  }
  const skewMs = skewRef.current ?? 0;

  const [participants, setParticipants] = useState<SessionParticipant[]>(
    join?.participants ?? [],
  );

  const [online, setOnline] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(new Map());
  const [notices, setNotices] = useState<SessionNotice[]>([]);
  const [comments, setComments] = useState<SessionComment[]>([]);

  // Shared by the live wire handler and the optimistic local writers below —
  // upserts by id so a hydration refetch and a broadcast racing each other
  // never produce a duplicate row.
  const applyComment = (row: SessionComment) => {
    setComments((prev) => {
      const idx = prev.findIndex((c) => c.id === row.id);
      if (idx === -1) return [...prev, row];
      const next = prev.slice();
      next[idx] = row;
      return next;
    });
  };
  const [status, setStatus] = useState<SessionStatus>(join?.session.status ?? "open");
  const [ended, setEnded] = useState(join?.session.status === "ended");
  const [doneAtMs, setDoneAtMs] = useState<number | null>(() => {
    if (!join?.session.completed_at) return null;
    return Date.parse(join.session.completed_at);
  });
  const [nowTick, setNowTick] = useState(() => Date.now());

  // ---- the client's lifetime -------------------------------------------------

  useEffect(() => {
    if (!join || !user) return;
    const id = join.session.id;
    const me = join.participants.find((p) => p.user_id === user.id);

    // Two-phase removal so a notice fades out (not just in) — mark it
    // `leaving` for one animation frame, then drop it from the array.
    const dismissNotice = (noticeId: number) => {
      setNotices((n) => n.map((x) => (x.id === noticeId ? { ...x, leaving: true } : x)));
      setTimeout(() => setNotices((n) => n.filter((x) => x.id !== noticeId)), 180);
    };
    const pushNotice = (text: string) => {
      const noticeId = ++noticeIdRef.current;
      setNotices((n) => [...n, { id: noticeId, kind: "text", text }]);
      setTimeout(() => dismissNotice(noticeId), NOTICE_TTL_MS);
    };
    const pushCommentNotice = (payload: { authorId: string; body: string }) => {
      const noticeId = ++noticeIdRef.current;
      setNotices((n) => [...n, { id: noticeId, kind: "comment", ...payload }]);
      setTimeout(() => dismissNotice(noticeId), NOTICE_TTL_MS);
    };

    const client = new CoopClient({
      sessionId: id,
      uid: user.id,
      meta: {
        username: me?.username ?? "solver",
        displayName: me?.display_name ?? "Solver",
        accent: me?.accent ?? FALLBACK_ACCENT,
      },
      initialState: join.session.state ?? {},
      initialVersion: join.session.state_version ?? 0,
      saveState: (state, versionMs) => pushSessionState(id, state, versionMs),
      fetchState: async () => {
        const row = await fetchSessionRow(id);
        return row ? { state: row.state, status: row.status } : null;
      },
      touch: () => touchSession(id),
      events: {
        onRemoteCells: (ops: WireOp[]) => {
          xwRef.current.applyRemoteCells(
            ops.map((op) => ({ row: op.r, col: op.c, value: op.val, revealed: op.rev })),
          );
        },
        onRemoteMarks: (marks) => {
          xwRef.current.applyRemoteMarks(
            marks.map((m) => ({ row: m.r, col: m.c, wrong: m.wrong })),
          );
        },
        onCursor: (sid: string, cursor: RemoteCursorState | null) => {
          setCursors((prev) => {
            const next = new Map(prev);
            if (!cursor) {
              next.delete(sid);
              return next;
            }
            const meta = peersBySidRef.current.get(sid);
            const username = meta?.username ?? "solver";
            const displayName = meta?.displayName ?? username;
            next.set(sid, {
              sid,
              userId: cursor.uid,
              username,
              displayName,
              row: cursor.r,
              col: cursor.c,
              direction: cursor.d,
              color: accentSwatch(meta?.accent ?? FALLBACK_ACCENT),
              letter: (displayName.trim()[0] ?? "?").toUpperCase(),
            });
            return next;
          });
        },
        onPresence: (peers: PeerMeta[]) => {
          peersBySidRef.current = new Map(peers.map((p) => [p.sid, p]));
          setOnline(new Set(peers.map((p) => p.uid)));
          const liveSids = new Set(peers.map((p) => p.sid));
          setCursors((prev) => {
            if (![...prev.keys()].some((sid) => !liveSids.has(sid))) return prev;
            return new Map([...prev].filter(([sid]) => liveSids.has(sid)));
          });
          // Presence is how we learn about joiners who arrived after us —
          // fold them into the durable roster.
          setParticipants((prev) => {
            const known = new Set(prev.map((p) => p.user_id));
            const fresh = peers.filter((p) => !known.has(p.uid));
            if (fresh.length === 0) return prev;
            const seen = new Set<string>();
            const rows = fresh
              .filter((p) => (seen.has(p.uid) ? false : (seen.add(p.uid), true)))
              .map((p) => ({
                user_id: p.uid,
                username: p.username,
                display_name: p.displayName,
                accent: p.accent ?? FALLBACK_ACCENT,
                joined_at: new Date(p.joinedAt).toISOString(),
              }));
            return [...prev, ...rows];
          });
        },
        onNotice: pushNotice,
        onDone: (atT: number) => {
          setStatus("completed");
          // atT is a client-wall-clock-ish HLC time — shift it into the
          // server domain to match created_at/completed_at.
          setDoneAtMs((prev) => prev ?? atT - (skewRef.current ?? 0));
          // Force-converge: a complete grid equals the solution, and the
          // solutions are local — snap any straggling cell so this client's
          // own `completed` flips too (firing the normal celebration path).
          const engine = xwRef.current;
          const fixes: { row: number; col: number; value: string; revealed: boolean }[] = [];
          for (const { row, col } of engine.openCells) {
            const sol = engine.solutionAt(row, col);
            if (sol && engine.entries[row][col] !== sol) {
              fixes.push({ row, col, value: sol, revealed: engine.revealed.has(`${row},${col}`) });
            }
          }
          if (fixes.length > 0) engine.applyRemoteCells(fixes);
        },
        onEnded: () => {
          setEnded(true);
          setStatus((s) => (s === "completed" ? s : "ended"));
        },
        onComment: (wire: WireComment) => {
          const row = commentFromWire(wire, id);
          applyComment(row);
          if (wire.authorId !== user.id) {
            pushCommentNotice({ authorId: wire.authorId, body: wire.body });
          }
        },
        onReconnected: () => {
          void listComments(id).then(setComments);
        },
      },
    });

    clientRef.current = client;
    bridge.current = {
      onCells: ({ cells }) => client.localCells(cells),
      onMarks: ({ marks }) =>
        client.localMarks(
          marks.map((m) => ({ r: m.row, c: m.col, expect: m.expect, wrong: m.wrong })),
        ),
    };
    client.connect();
    void listComments(id).then(setComments);

    return () => {
      bridge.current = {};
      clientRef.current = null;
      client.destroy();
      setComments([]);
    };
    // join/user identity is stable for the life of a mounted session Solver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  // ---- comments --------------------------------------------------------------

  const postComment = async (body: string) => {
    if (!join || !user) return;
    const row = await createComment({ sessionId: join.session.id, authorId: user.id, body });
    if (!row) return;
    applyComment(row);
    clientRef.current?.announceComment(commentToWire(row));
  };

  // ---- cursor broadcasts --------------------------------------------------------

  useEffect(() => {
    if (!join) return;
    clientRef.current?.localCursor(xw.active.row, xw.active.col, xw.direction);
  }, [join, xw.active, xw.direction]);

  // ---- completion ------------------------------------------------------------------

  useEffect(() => {
    if (!join || !xw.completed) return;
    const client = clientRef.current;
    if (!client || client.isDone()) return; // receipt path already handled it
    const atT = client.announceDone();
    setStatus("completed");
    setDoneAtMs((prev) => prev ?? atT - skewMs);
    void completeSession(join.session.id, client.serializeState(), Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [join?.session.id, xw.completed]);

  // ---- lifecycle: the shared clock and the inactivity observer ----------------------

  useEffect(() => {
    if (!join || ended || status === "completed") return;
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [join, ended, status]);

  useEffect(() => {
    if (!join || ended || status !== "open") return;
    const id = join.session.id;
    const check = async () => {
      const row = await fetchSessionRow(id);
      if (!row) return;
      if (row.status === "ended") {
        clientRef.current?.markEnded();
        setEnded(true);
        setStatus("ended");
        return;
      }
      if (row.status === "completed") {
        setStatus("completed");
        return;
      }
      if (Date.now() - Date.parse(row.last_activity_at) > SESSION_IDLE_MS) {
        // We're the observer that caught it — end it for everyone.
        await endSession(id);
        clientRef.current?.broadcastEnd();
        clientRef.current?.markEnded();
        setEnded(true);
        setStatus("ended");
      }
    };
    const interval = setInterval(() => void check(), ENDED_CHECK_MS);
    return () => clearInterval(interval);
  }, [join, ended, status]);

  if (!join) return null;

  // Shared clock: server-time anchored, so two devices with skewed clocks
  // still show the same count. Frozen once done.
  const createdAtMs = Date.parse(join.session.created_at);
  const endMs = doneAtMs ?? nowTick - skewMs;
  const elapsed = Math.max(0, Math.floor((endMs - createdAtMs) / 1000));

  return {
    status,
    participants,
    online,
    cursors: [...cursors.values()],
    notices,
    elapsed,
    ended,
    inviteUrl: `${window.location.origin}${BASE}s/${join.session.id}`,
    comments,
    postComment,
  };
}
