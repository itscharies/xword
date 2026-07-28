// The co-op wire protocol: a per-cell last-write-wins map replicated over a
// Supabase Realtime broadcast channel, with a throttled durable snapshot in
// the session row for late join/refresh. This module is deliberately
// engine-agnostic — useCrossword knows nothing of stamps or channels, and
// this file knows nothing of React; useSession.ts binds the two.
//
// Correctness rests on three properties:
//   1. Stamps are hybrid-logical-clock times (never raw wall clock), so a
//      player whose clock runs slow still wins when they deliberately
//      overwrite a letter they *saw arrive* — causally-later edits always
//      carry a larger stamp.
//   2. The merge is idempotent and commutative, so snapshots, replays and
//      out-of-order delivery are all safe to feed through the same function.
//   3. `revealed` is terminal and outranks any stamp — a revealed cell can
//      never be un-revealed by a stale in-flight edit racing the reveal.

import { supabase } from "./supabase.ts";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Direction, Puzzle } from "../types.ts";
import type { Progress } from "./storage.ts";

export const PROTO_V = 1;

/** How long a session may sit with no edits or cursor movement before any
 *  observer (client or the join RPC's lazy reaper) declares it ended. Keep
 *  in sync with the `interval '30 minutes'` in the sessions migration. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface Stamp {
  /** HLC millis — wall-clock-ish, but ratcheted past every observed stamp. */
  t: number;
  /** Actor id (per-tab uuid) — total-order tiebreak for equal times. */
  a: string;
}

export interface CellRecord {
  val: string; // "" = cleared; multi-char = rebus. Always uppercase.
  rev: boolean; // revealed lock — terminal once true
  st: Stamp;
}

/** Sparse cell map keyed "r,c"; untouched cells are absent. */
export type GridCells = Record<string, CellRecord>;

export interface WrongMark {
  r: number;
  c: number;
  /** The value that was standing when the check marked it — a mark only
   *  applies while the cell still holds this value. */
  expect: string;
}

/** The jsonb persisted in sessions.state. */
export interface SessionState {
  cells?: GridCells;
  wrong?: WrongMark[];
  hlcMax?: number;
  done?: boolean;
}

// ---- wire messages ---------------------------------------------------------

interface Env {
  v: number;
  uid: string;
  sid: string;
  /** Per-sender counter on the reliable stream (everything except `cur`) —
   *  receivers detect gaps and resync. */
  seq: number;
}

export interface WireOp {
  r: number;
  c: number;
  val: string;
  rev: boolean;
  st: Stamp;
}

export interface WireCursor {
  r: number;
  c: number;
  d: Direction;
}

interface CellMsg extends Env {
  ops: WireOp[];
  /** The sender's cursor after this edit — piggybacked so typing never pays
   *  for a separate cursor message. */
  cur?: WireCursor;
}

interface CurMsg extends Env, WireCursor {}

export interface MarkAssert {
  r: number;
  c: number;
  expect: string;
  wrong: boolean;
}

interface MarksMsg extends Env {
  marks: MarkAssert[];
}

type SnapReqMsg = Env;

interface SnapMsg extends Env {
  cells: GridCells;
  wrong: WrongMark[];
  hlcMax: number;
}

interface DoneMsg extends Env {
  /** HLC time of the completing write — the canonical completion instant,
   *  identical for everyone. */
  atT: number;
}

interface EndMsg extends Env {
  reason: string;
}

// ---- clocks & merge --------------------------------------------------------

class Hlc {
  lastT = 0;
  now(): number {
    this.lastT = Math.max(Date.now(), this.lastT + 1);
    return this.lastT;
  }
  observe(t: number): void {
    if (Number.isFinite(t) && t > this.lastT) this.lastT = t;
  }
}

const newer = (x: Stamp, y: Stamp) => (x.t !== y.t ? x.t > y.t : x.a > y.a);

const keyRC = (r: number, c: number) => `${r},${c}`;

/** The one merge rule, applied to live ops and snapshot cells alike.
 *  Returns true when the op was accepted into `cells`. */
export function mergeOp(cells: GridCells, op: WireOp): boolean {
  const k = keyRC(op.r, op.c);
  const local = cells[k];
  if (local) {
    if (local.rev && !op.rev) return false; // revealed is terminal
    if (!(op.rev && !local.rev) && !newer(op.st, local.st)) return false;
  }
  cells[k] = { val: op.val, rev: op.rev, st: op.st };
  return true;
}

// ---- snapshot <-> Progress conversion ---------------------------------------

/** Hydrate the shared snapshot into the shape Solver seeds useCrossword
 *  with. Cells outside the current grid (a puzzle re-parsed to a different
 *  size mid-session — vanishingly unlikely, but cheap to guard) are dropped. */
export function progressFromSessionState(
  state: SessionState,
  puzzle: Puzzle,
): Progress {
  const entries = puzzle.grid.map((row) => row.map(() => ""));
  const revealed: string[] = [];
  for (const [k, cell] of Object.entries(state.cells ?? {})) {
    const [r, c] = k.split(",").map(Number);
    if (!Number.isInteger(r) || !Number.isInteger(c)) continue;
    if (r < 0 || c < 0 || r >= puzzle.height || c >= puzzle.width) continue;
    entries[r][c] = cell.val;
    if (cell.rev) revealed.push(k);
  }
  return {
    entries,
    revealed,
    elapsed: 0, // session mode runs on the shared clock, not saved elapsed
    completed: !!state.done,
  };
}

/** Seed a fresh session's snapshot from the creator's current progress —
 *  every filled cell gets a base stamp so later edits (whose HLCs observe
 *  hlcMax first) always rank above the seed. */
export function stateFromProgress(
  progress: Progress | null,
  actor: string,
): SessionState {
  const cells: GridCells = {};
  const t = Date.now();
  const revealed = new Set(progress?.revealed ?? []);
  (progress?.entries ?? []).forEach((row, r) =>
    row.forEach((val, c) => {
      if (!val) return;
      const k = keyRC(r, c);
      cells[k] = { val, rev: revealed.has(k), st: { t, a: actor } };
    }),
  );
  return { cells, wrong: [], hlcMax: t };
}

// ---- the channel client ------------------------------------------------------

export interface PeerMeta {
  uid: string;
  sid: string;
  username: string;
  displayName: string;
  joinedAt: number;
}

export interface RemoteCursorState extends WireCursor {
  uid: string;
}

export interface CoopEvents {
  /** Merge-accepted remote cell ops — apply to the engine verbatim. */
  onRemoteCells(ops: WireOp[]): void;
  /** Check-result assertions that passed the expect-guard. */
  onRemoteMarks(marks: MarkAssert[]): void;
  /** A peer's cursor moved (or left — null removes it). */
  onCursor(sid: string, cursor: RemoteCursorState | null): void;
  /** Presence roster changed (all live tabs, self included). */
  onPresence(peers: PeerMeta[]): void;
  /** "X joined" / "X left" — own tabs already filtered out. */
  onNotice(text: string): void;
  /** The grid was observed complete somewhere — force-converged locally. */
  onDone(atT: number): void;
  /** The session was ended (inactivity). */
  onEnded(): void;
}

export interface CoopDeps {
  sessionId: string;
  uid: string;
  meta: { username: string; displayName: string };
  initialState: SessionState;
  initialVersion: number;
  /** Guarded snapshot write (UPDATE ... WHERE state_version < versionMs). */
  saveState: (state: SessionState, versionMs: number) => void;
  /** Re-fetch the session row on reconnect resync. */
  fetchState: () => Promise<{ state: SessionState; status: string } | null>;
  /** Bump last_activity_at (already rate-limited here to 1/min). */
  touch: () => void;
  events: CoopEvents;
}

/** Local edit deltas as the engine reports them. */
export interface LocalCellDelta {
  row: number;
  col: number;
  value: string;
  revealed: boolean;
}

const EDIT_COALESCE_MS = 150;
const CURSOR_THROTTLE_MS = 250;
const SNAPSHOT_DEBOUNCE_MS = 2000;
const SNAPSHOT_MIN_INTERVAL_MS = 10_000;
const TOUCH_MIN_INTERVAL_MS = 60_000;
const GAP_RESYNC_DEBOUNCE_MS = 1000;
const SNAP_RESPONDER_DELAY_MS = 300;

export class CoopClient {
  readonly sid = crypto.randomUUID();

  private readonly hlc = new Hlc();
  private cells: GridCells;
  private wrong = new Map<string, string>(); // key -> expect
  private done = false;
  private ended = false;
  private destroyed = false;

  private channel: RealtimeChannel | null = null;
  private seq = 0;
  private lastSeqBySid = new Map<string, number>();
  private unacked = new Map<number, { event: string; payload: Env }>();
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private versionNotified = false;

  private editBuffer: WireOp[] = [];
  private editFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private cursor: WireCursor | null = null;
  private cursorSent: WireCursor | null = null;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;

  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotDirty = false;
  private lastSnapshotAt = 0;
  private lastVersion: number;

  private lastTouchAt = 0;
  private lastSnapSeenAt = 0;
  private subscribedAt = 0;
  private gapTimer: ReturnType<typeof setTimeout> | null = null;
  private snapReplyTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly flushOnHide = () => {
    if (document.visibilityState === "hidden") this.flushAll();
  };
  private readonly flushOnPageHide = () => this.flushAll();

  constructor(private readonly deps: CoopDeps) {
    this.cells = structuredClone(deps.initialState.cells ?? {});
    for (const m of deps.initialState.wrong ?? []) {
      this.wrong.set(keyRC(m.r, m.c), m.expect);
    }
    this.hlc.observe(deps.initialState.hlcMax ?? 0);
    this.done = !!deps.initialState.done;
    this.lastVersion = deps.initialVersion;
  }

  connect(): void {
    if (this.destroyed || !supabase) return;
    document.addEventListener("visibilitychange", this.flushOnHide);
    window.addEventListener("pagehide", this.flushOnPageHide);
    this.openChannel(true);
  }

  destroy(): void {
    this.destroyed = true;
    this.flushAll();
    document.removeEventListener("visibilitychange", this.flushOnHide);
    window.removeEventListener("pagehide", this.flushOnPageHide);
    for (const t of [
      this.editFlushTimer,
      this.cursorTimer,
      this.snapshotTimer,
      this.gapTimer,
      this.snapReplyTimer,
      this.reconnectTimer,
    ]) {
      if (t) clearTimeout(t);
    }
    this.teardownChannel();
  }

  // ---- local input (from the engine via useSession) ------------------------

  localCells(deltas: LocalCellDelta[]): void {
    if (this.done || this.ended || deltas.length === 0) return;
    for (const d of deltas) {
      const op: WireOp = {
        r: d.row,
        c: d.col,
        val: d.value,
        rev: d.revealed,
        st: { t: this.hlc.now(), a: this.sid },
      };
      // Local writes always land: the stamp was just minted, so it's newer
      // than anything in the map (and reveals rank above stamps anyway).
      mergeOp(this.cells, op);
      this.wrong.delete(keyRC(d.row, d.col));
      this.editBuffer.push(op);
    }
    this.markDirty();
    if (!this.editFlushTimer) {
      this.editFlushTimer = setTimeout(() => this.flushEdits(), EDIT_COALESCE_MS);
    }
  }

  localMarks(marks: MarkAssert[]): void {
    if (this.done || this.ended || marks.length === 0) return;
    for (const m of marks) {
      if (m.wrong) this.wrong.set(keyRC(m.r, m.c), m.expect);
      else this.wrong.delete(keyRC(m.r, m.c));
    }
    this.markDirty();
    this.sendReliable("marks", { marks } as Partial<MarksMsg>);
    this.touchIfDue();
  }

  localCursor(r: number, c: number, d: Direction): void {
    if (this.ended) return;
    this.cursor = { r, c, d };
    if (this.cursorTimer) return; // trailing-edge throttle
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      this.flushCursor();
    }, CURSOR_THROTTLE_MS);
  }

  /** The local grid went fully correct — broadcast the terminal latch. */
  announceDone(): number {
    const atT = this.hlc.now();
    if (!this.done) {
      this.done = true;
      this.sendReliable("done", { atT } as Partial<DoneMsg>);
      this.writeSnapshotNow();
    }
    return atT;
  }

  markEnded(): void {
    if (this.ended) return;
    this.ended = true;
    this.flushAll();
    this.teardownChannel();
  }

  isDone(): boolean {
    return this.done;
  }

  serializeState(): SessionState {
    return {
      cells: this.cells,
      wrong: [...this.wrong.entries()].map(([k, expect]) => {
        const [r, c] = k.split(",").map(Number);
        return { r, c, expect };
      }),
      hlcMax: this.hlc.lastT,
      done: this.done,
    };
  }

  // ---- channel plumbing ------------------------------------------------------

  private openChannel(first: boolean): void {
    if (this.destroyed || this.ended || !supabase) return;
    this.teardownChannel();
    const ch = supabase.channel(`coop:${this.deps.sessionId}`, {
      config: {
        broadcast: { self: false, ack: true },
        presence: { key: this.sid },
      },
    });
    this.channel = ch;

    ch.on("broadcast", { event: "cell" }, ({ payload }) => this.recvCell(payload as CellMsg));
    ch.on("broadcast", { event: "cur" }, ({ payload }) => this.recvCursor(payload as CurMsg));
    ch.on("broadcast", { event: "marks" }, ({ payload }) => this.recvMarks(payload as MarksMsg));
    ch.on("broadcast", { event: "snapreq" }, ({ payload }) => this.recvSnapReq(payload as SnapReqMsg));
    ch.on("broadcast", { event: "snap" }, ({ payload }) => this.recvSnap(payload as SnapMsg));
    ch.on("broadcast", { event: "done" }, ({ payload }) => this.recvDone(payload as DoneMsg));
    ch.on("broadcast", { event: "end" }, ({ payload }) => this.recvEnd(payload as EndMsg));

    ch.on("presence", { event: "sync" }, () => this.syncPresence());
    ch.on("presence", { event: "join" }, ({ newPresences }) => {
      // The initial presence sync (and every re-subscribe) replays everyone
      // already in the room as "joins" — only genuine arrivals get a notice.
      const settled = Date.now() - this.subscribedAt > 2000;
      for (const p of newPresences as unknown as PeerMeta[]) {
        if (settled && p.uid && p.uid !== this.deps.uid) {
          this.deps.events.onNotice(`${p.displayName || p.username} joined`);
        }
      }
    });
    ch.on("presence", { event: "leave" }, ({ leftPresences }) => {
      for (const p of leftPresences as unknown as PeerMeta[]) {
        if (p.sid) this.deps.events.onCursor(p.sid, null);
        if (p.uid && p.uid !== this.deps.uid) {
          this.deps.events.onNotice(`${p.displayName || p.username} left`);
        }
      }
    });

    ch.subscribe((status) => {
      if (this.destroyed || this.ended) return;
      if (status === "SUBSCRIBED") {
        this.reconnectDelay = 1000;
        this.subscribedAt = Date.now();
        void ch.track({
          uid: this.deps.uid,
          sid: this.sid,
          username: this.deps.meta.username,
          displayName: this.deps.meta.displayName,
          joinedAt: Date.now(),
        } satisfies PeerMeta);
        void this.resync(first);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        this.scheduleReconnect();
      }
    });
  }

  private teardownChannel(): void {
    if (this.channel && supabase) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.ended || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openChannel(false);
    }, delay);
  }

  /** Runs on every successful (re)subscribe. The merge's idempotence makes
   *  the overlap between snapshot, live ops and re-sent buffers harmless. */
  private async resync(first: boolean): Promise<void> {
    let snapshot = this.deps.initialState;
    if (!first) {
      const row = await this.deps.fetchState();
      if (!row) return;
      if (row.status === "ended") {
        this.markEnded();
        this.deps.events.onEnded();
        return;
      }
      snapshot = row.state;
    }
    const watermark = snapshot.hlcMax ?? 0;
    this.applySnapshot(snapshot);

    // Re-send anything the server never acked, plus our own cells newer than
    // the durable watermark (acked but possibly never snapshotted while we
    // and the peer were both offline).
    for (const { event, payload } of [...this.unacked.values()]) {
      void this.rawSend(event, payload);
    }
    const mine = Object.entries(this.cells)
      .filter(([, cell]) => cell.st.a === this.sid && cell.st.t > watermark)
      .map(([k, cell]) => {
        const [r, c] = k.split(",").map(Number);
        return { r, c, val: cell.val, rev: cell.rev, st: cell.st } satisfies WireOp;
      });
    if (mine.length) this.sendReliable("cell", { ops: mine } as Partial<CellMsg>);

    this.sendReliable("snapreq", {});
  }

  private applySnapshot(snapshot: SessionState): void {
    this.hlc.observe(snapshot.hlcMax ?? 0);
    const accepted: WireOp[] = [];
    for (const [k, cell] of Object.entries(snapshot.cells ?? {})) {
      const [r, c] = k.split(",").map(Number);
      const op: WireOp = { r, c, val: cell.val, rev: cell.rev, st: cell.st };
      if (mergeOp(this.cells, op)) {
        accepted.push(op);
        this.wrong.delete(k);
      }
    }
    if (accepted.length) this.deps.events.onRemoteCells(accepted);
    this.applyMarksGuarded(
      (snapshot.wrong ?? []).map((m) => ({ ...m, wrong: true })),
    );
    if (snapshot.done && !this.done) {
      this.done = true;
      this.deps.events.onDone(snapshot.hlcMax ?? this.hlc.lastT);
    }
  }

  // ---- receive ----------------------------------------------------------------

  private checkEnvelope(msg: Env, sequenced: boolean): boolean {
    if (!msg || msg.sid === this.sid) return false;
    if (msg.v > PROTO_V) {
      if (!this.versionNotified) {
        this.versionNotified = true;
        this.deps.events.onNotice(
          "Your co-op partner is on a newer version — refresh to stay in sync",
        );
      }
      return false;
    }
    if (sequenced) {
      const last = this.lastSeqBySid.get(msg.sid);
      if (last !== undefined && msg.seq > last + 1 && !this.gapTimer) {
        // Missed something from this sender — ask the room for a snapshot,
        // debounced so a burst of gaps costs one request.
        this.gapTimer = setTimeout(() => {
          this.gapTimer = null;
          this.sendReliable("snapreq", {});
        }, GAP_RESYNC_DEBOUNCE_MS);
      }
      if (last === undefined || msg.seq > last) this.lastSeqBySid.set(msg.sid, msg.seq);
    }
    return true;
  }

  private recvCell(msg: CellMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    if (this.done || this.ended) return;
    const accepted: WireOp[] = [];
    for (const op of msg.ops ?? []) {
      this.hlc.observe(op.st.t);
      if (mergeOp(this.cells, op)) {
        accepted.push(op);
        this.wrong.delete(keyRC(op.r, op.c));
      }
    }
    if (accepted.length) {
      this.deps.events.onRemoteCells(accepted);
      this.markDirty();
    }
    if (msg.cur) {
      this.deps.events.onCursor(msg.sid, { ...msg.cur, uid: msg.uid });
    }
  }

  private recvCursor(msg: CurMsg): void {
    if (!this.checkEnvelope(msg, false)) return;
    this.deps.events.onCursor(msg.sid, { r: msg.r, c: msg.c, d: msg.d, uid: msg.uid });
  }

  private recvMarks(msg: MarksMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    if (this.done || this.ended) return;
    this.applyMarksGuarded(msg.marks ?? []);
    this.markDirty();
  }

  /** A mark only applies while the cell still holds the value that was
   *  checked — a concurrent edit invalidates it (matching solo semantics,
   *  where writing a cell clears its wrong flag). */
  private applyMarksGuarded(marks: MarkAssert[]): void {
    const passed: MarkAssert[] = [];
    for (const m of marks) {
      const k = keyRC(m.r, m.c);
      const current = this.cells[k]?.val ?? "";
      if (current !== m.expect) continue;
      if (m.wrong) this.wrong.set(k, m.expect);
      else this.wrong.delete(k);
      passed.push(m);
    }
    if (passed.length) this.deps.events.onRemoteMarks(passed);
  }

  private recvSnapReq(msg: SnapReqMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    // Responder election: the live tab with the smallest sid (excluding the
    // requester) answers, after a short delay in which a reply from someone
    // else calls it off. Everyone answering would be correct but wasteful.
    const peers = this.presencePeers()
      .map((p) => p.sid)
      .filter((sid) => sid !== msg.sid)
      .sort();
    if (peers[0] !== this.sid) return;
    const askedAt = Date.now();
    if (this.snapReplyTimer) clearTimeout(this.snapReplyTimer);
    this.snapReplyTimer = setTimeout(() => {
      this.snapReplyTimer = null;
      if (this.lastSnapSeenAt > askedAt || this.ended) return;
      const state = this.serializeState();
      this.sendReliable("snap", {
        cells: state.cells,
        wrong: state.wrong,
        hlcMax: state.hlcMax,
      } as Partial<SnapMsg>);
    }, SNAP_RESPONDER_DELAY_MS);
  }

  private recvSnap(msg: SnapMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    this.lastSnapSeenAt = Date.now();
    if (this.done || this.ended) return;
    this.applySnapshot({ cells: msg.cells, wrong: msg.wrong, hlcMax: msg.hlcMax });
  }

  private recvDone(msg: DoneMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    if (this.done) return;
    this.done = true;
    this.hlc.observe(msg.atT);
    this.deps.events.onDone(msg.atT);
    this.writeSnapshotNow();
  }

  private recvEnd(msg: EndMsg): void {
    if (!this.checkEnvelope(msg, true)) return;
    this.markEnded();
    this.deps.events.onEnded();
  }

  broadcastEnd(): void {
    this.sendReliable("end", { reason: "inactivity" } as Partial<EndMsg>);
  }

  // ---- presence ------------------------------------------------------------------

  private presencePeers(): PeerMeta[] {
    if (!this.channel) return [];
    const state = this.channel.presenceState<PeerMeta>();
    return Object.values(state).flat();
  }

  private syncPresence(): void {
    this.deps.events.onPresence(this.presencePeers());
  }

  // ---- send helpers ----------------------------------------------------------------

  private envelope(): Env {
    return { v: PROTO_V, uid: this.deps.uid, sid: this.sid, seq: ++this.seq };
  }

  private sendReliable(event: string, body: object): void {
    const payload = { ...this.envelope(), ...body };
    this.unacked.set(payload.seq, { event, payload });
    void this.rawSend(event, payload, true);
    this.touchIfDue();
  }

  private async rawSend(event: string, payload: Env, retryOnce = false): Promise<void> {
    const ch = this.channel;
    if (!ch) return;
    try {
      const res = await ch.send({ type: "broadcast", event, payload });
      if (res === "ok") {
        this.unacked.delete(payload.seq);
      } else if (retryOnce) {
        setTimeout(() => void this.rawSend(event, payload, false), 1000);
      }
    } catch {
      // Keep in `unacked`; the next resync re-sends it.
    }
  }

  private flushEdits(): void {
    if (this.editFlushTimer) {
      clearTimeout(this.editFlushTimer);
      this.editFlushTimer = null;
    }
    if (this.editBuffer.length === 0) return;
    const ops = this.editBuffer;
    this.editBuffer = [];
    const body: Partial<CellMsg> = { ops };
    if (this.cursor) {
      body.cur = this.cursor;
      this.cursorSent = this.cursor;
      if (this.cursorTimer) {
        clearTimeout(this.cursorTimer);
        this.cursorTimer = null;
      }
    }
    this.sendReliable("cell", body);
  }

  private flushCursor(): void {
    const cur = this.cursor;
    if (!cur || this.ended) return;
    const sent = this.cursorSent;
    if (sent && sent.r === cur.r && sent.c === cur.c && sent.d === cur.d) return;
    this.cursorSent = cur;
    // Unsequenced ephemera — a lost cursor frame is superseded by the next.
    const payload = { ...this.envelope(), ...cur };
    this.unacked.delete(payload.seq);
    const ch = this.channel;
    if (ch) void ch.send({ type: "broadcast", event: "cur", payload });
    this.touchIfDue();
  }

  // ---- snapshots & activity -----------------------------------------------------------

  private markDirty(): void {
    this.snapshotDirty = true;
    if (this.snapshotTimer) return;
    const wait = Math.max(
      SNAPSHOT_DEBOUNCE_MS,
      this.lastSnapshotAt + SNAPSHOT_MIN_INTERVAL_MS - Date.now(),
    );
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.writeSnapshotNow();
    }, wait);
  }

  private writeSnapshotNow(): void {
    if (!this.snapshotDirty && !this.done) return;
    this.snapshotDirty = false;
    this.lastSnapshotAt = Date.now();
    this.lastVersion = Math.max(Date.now(), this.lastVersion + 1);
    this.deps.saveState(this.serializeState(), this.lastVersion);
  }

  private touchIfDue(): void {
    const now = Date.now();
    if (now - this.lastTouchAt < TOUCH_MIN_INTERVAL_MS) return;
    this.lastTouchAt = now;
    this.deps.touch();
  }

  /** Get everything pending out the door — called on hide/unload/destroy. */
  private flushAll(): void {
    this.flushEdits();
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.snapshotDirty) this.writeSnapshotNow();
  }
}
