// An in-memory stand-in for the Supabase client, so signed-in/signed-out UI
// can be exercised locally (`npm run dev:mock`) without a real project, real
// Google OAuth, or hand-editing state into the code to fake a session. Only
// implements the query/auth surface the app actually calls (see the grep-
// checked method list below) — this is a dev tool, not a Postgrest clone.
//
// Swapped in by src/lib/supabase.ts when VITE_MOCK_BACKEND=1. Signing in/out
// is driven by the dev-only switcher in App.tsx via mockSignIn/mockSignOut,
// not by real OAuth (there's nothing to redirect to in mock mode).

import { puzzleTypeOf, type Cell, type Clue, type Puzzle } from "../types.ts";
import { SOURCE_ORDER, type PuzzleSource } from "./sources.ts";
import type { AccentId } from "./theme.ts";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

interface MockProfile {
  user_id: string;
  username: string;
  display_name: string;
  accent: AccentId;
  is_admin: boolean;
}

interface MockFollow {
  follower_id: string;
  followee_id: string;
}

interface MockPuzzle {
  id: string;
  author_id: string;
  title: string;
  data: Puzzle;
  visibility: "public" | "mutual" | "unlisted" | "draft";
  completions: number;
  created_at: string; // ISO timestamp
}

interface MockSyndicated {
  source: PuzzleSource;
  puzzle_date: string;
  iso_date: string;
  weekday: string;
  title: string;
  author: string;
  source_priority: number;
  data: Puzzle;
}

interface MockProgress {
  user_id: string;
  source: string | null;
  puzzle_date: string | null;
  puzzle_id: string | null;
  data: unknown;
  client_updated_at: number;
}

const IRIS = "11111111-1111-1111-1111-111111111111";
const MAX = "22222222-2222-2222-2222-222222222222";
const SAM = "33333333-3333-3333-3333-333333333333";
const ADA = "44444444-4444-4444-4444-444444444444";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const weekdayOf = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });

/** A tiny (but structurally valid) crossword — just enough for the Solver to
 *  render — used for every seeded puzzle so the fixtures stay short. */
function miniPuzzle(opts: {
  title: string;
  author: string;
  isoDate: string;
  date: string;
  source?: PuzzleSource;
}): Puzzle {
  return {
    source: opts.source,
    date: opts.date,
    isoDate: opts.isoDate,
    weekday: weekdayOf(opts.isoDate),
    title: opts.title,
    author: opts.author,
    editor: "Mock Editor",
    width: 3,
    height: 1,
    grid: [[{ solution: "C", number: 1 }, { solution: "A" }, { solution: "T" }]],
    clues: {
      across: [{ number: 1, clue: "Feline (mock)", answer: "CAT", row: 0, col: 0, len: 3 }],
      down: [],
    },
  };
}

/** A generated full-size 15x15 — big enough to exercise the grid layout
 *  modes (the canvas pan/zoom view in particular), which the 3x1 mini can
 *  never overflow. Grid pattern is scanned for numbering and clues, so the
 *  fixture stays consistent by construction. */
function bigPuzzle(opts: {
  title: string;
  author: string;
  isoDate: string;
  date: string;
  source?: PuzzleSource;
}): Puzzle {
  // '#' = block. A standard-looking, roughly symmetric 15x15 pattern.
  const rows = [
    "...#.....#.....",
    "...#.....#.....",
    "...............",
    "......#...#....",
    "###....#.......",
    ".....#....#....",
    "....#....#.....",
    "...#.......#...",
    ".....#....#....",
    "....#....#.....",
    ".......#....###",
    "....#...#......",
    "...............",
    ".....#.....#...",
    ".....#.....#...",
  ];
  const size = rows.length;
  const letter = (r: number, c: number) =>
    String.fromCharCode(65 + ((r * size + c * 7) % 26));
  const grid: Cell[][] = rows.map((row, r) =>
    [...row].map((ch, c) => (ch === "#" ? { black: true } : { solution: letter(r, c) })),
  );

  // Standard numbering scan: a cell gets a number when it starts an across
  // and/or down run of at least two cells.
  const open = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c < size && !grid[r][c].black;
  const across: Clue[] = [];
  const down: Clue[] = [];
  let num = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!open(r, c)) continue;
      const startsAcross = !open(r, c - 1) && open(r, c + 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      grid[r][c].number = ++num;
      if (startsAcross) {
        let len = 0;
        let answer = "";
        while (open(r, c + len)) answer += grid[r][c + len++].solution;
        across.push({ number: num, clue: `Mock across, ${len} letters`, answer, row: r, col: c, len });
      }
      if (startsDown) {
        let len = 0;
        let answer = "";
        while (open(r + len, c)) answer += grid[r + len++][c].solution;
        down.push({ number: num, clue: `Mock down, ${len} letters`, answer, row: r, col: c, len });
      }
    }
  }

  return {
    source: opts.source,
    date: opts.date,
    isoDate: opts.isoDate,
    weekday: weekdayOf(opts.isoDate),
    title: opts.title,
    author: opts.author,
    editor: "Mock Editor",
    width: size,
    height: size,
    grid,
    clues: { across, down },
  };
}

function makeSyndicatedRow(
  source: PuzzleSource,
  isoDate: string,
  title: string,
  big = false,
): MockSyndicated {
  const date = isoDate.replace(/-/g, "");
  const make = big ? bigPuzzle : miniPuzzle;
  return {
    source,
    puzzle_date: date,
    iso_date: isoDate,
    weekday: weekdayOf(isoDate),
    title,
    author: "Mock Author",
    source_priority: SOURCE_ORDER.indexOf(source),
    data: make({ title, author: "Mock Author", isoDate, date, source }),
  };
}

const db = {
  profiles: [
    { user_id: IRIS, username: "iris_solver", display_name: "Iris", accent: "pink", is_admin: false },
    { user_id: MAX, username: "max_cryptic", display_name: "Max", accent: "blue", is_admin: false },
    { user_id: SAM, username: "sam_grid", display_name: "Sam", accent: "orange", is_admin: false },
    // The one admin — for the /admin stats page.
    { user_id: ADA, username: "ada_admin", display_name: "Ada", accent: "green", is_admin: true },
  ] as MockProfile[],

  // Sam follows Iris (one-way); Iris and Max follow each other (mutual).
  // Sam never follows Max, so Max's puzzles stay invisible to Sam — good
  // coverage for "only puzzles from people *you* follow show up."
  follows: [
    { follower_id: SAM, followee_id: IRIS },
    { follower_id: IRIS, followee_id: MAX },
    { follower_id: MAX, followee_id: IRIS },
  ] as MockFollow[],

  puzzles: [
    {
      id: "a1111111-0000-0000-0000-000000000001",
      author_id: IRIS,
      title: "Iris's Public Puzzle",
      data: miniPuzzle({ title: "Iris's Public Puzzle", author: "Iris", isoDate: isoDaysAgo(0), date: "p1" }),
      visibility: "public",
      completions: 2,
      // Drafted days before its puzzle date — the feed must list it under
      // the date the author picked (today), not the day the row was created.
      created_at: `${isoDaysAgo(3)}T09:00:00Z`,
    },
    {
      id: "a1111111-0000-0000-0000-000000000002",
      author_id: MAX,
      title: "Max's Mutuals-Only Puzzle",
      data: miniPuzzle({ title: "Max's Mutuals-Only Puzzle", author: "Max", isoDate: isoDaysAgo(1), date: "p2" }),
      visibility: "mutual",
      completions: 0,
      created_at: `${isoDaysAgo(1)}T09:00:00Z`,
    },
    {
      id: "a1111111-0000-0000-0000-000000000003",
      author_id: IRIS,
      title: "Iris's Unlisted Puzzle",
      data: miniPuzzle({ title: "Iris's Unlisted Puzzle", author: "Iris", isoDate: isoDaysAgo(2), date: "p3" }),
      visibility: "unlisted",
      completions: 0,
      created_at: `${isoDaysAgo(2)}T09:00:00Z`,
    },
    {
      id: "a1111111-0000-0000-0000-000000000004",
      author_id: SAM,
      title: "Sam's Draft",
      // A legacy-format draft: its cross-reference exists only as text baked
      // into the 1-Across clue, with no structured `links` field — reopening
      // it must recover the ref into a real link with the text stripped.
      data: {
        date: "p4",
        isoDate: isoDaysAgo(0),
        weekday: weekdayOf(isoDaysAgo(0)),
        title: "Sam's Draft",
        author: "Sam",
        editor: "Mock Editor",
        width: 2,
        height: 2,
        grid: [
          [{ solution: "A", number: 1 }, { solution: "B", number: 2 }],
          [{ solution: "B", number: 3 }, { solution: "A" }],
        ],
        clues: {
          across: [
            { number: 1, clue: "First half (see 3-Across)", answer: "AB", row: 0, col: 0, len: 2 },
            { number: 3, clue: "Second half", answer: "BA", row: 1, col: 0, len: 2 },
          ],
          down: [
            { number: 1, clue: "Reading downward", answer: "AB", row: 0, col: 0, len: 2 },
            { number: 2, clue: "Also downward", answer: "BA", row: 0, col: 1, len: 2 },
          ],
        },
      },
      visibility: "draft",
      completions: 0,
      created_at: `${isoDaysAgo(0)}T10:00:00Z`,
    },
  ] as MockPuzzle[],

  syndicated_puzzles: [
    makeSyndicatedRow("nyt", isoDaysAgo(0), "NYT Mock Puzzle — Today", true),
    // Same day as the row above, different source — exercises the
    // same-day, cross-source (SOURCE_ORDER) tie-break.
    makeSyndicatedRow("gdn-mini", isoDaysAgo(0), "Guardian Mini Mock — Today"),
    makeSyndicatedRow("nyt", isoDaysAgo(1), "NYT Mock Puzzle — Yesterday"),
    makeSyndicatedRow("latimes", isoDaysAgo(2), "LA Times Mock Puzzle"),
    // Fetched ahead of its publish date — must never appear in the feed or
    // be reachable by direct URL until "today" catches up to it.
    makeSyndicatedRow("nyt", isoDaysAgo(-1), "NYT Mock Puzzle — Tomorrow (should be hidden)"),
  ] as MockSyndicated[],

  // Max ↔ Iris are mutuals, so signing in as Iris shows Max's chips on
  // today's NYT puzzle (in progress) and on Iris's own public puzzle
  // (solved). Full Progress objects, not just the summary fields — Max's
  // own session pulls these into the Solver, which reads `entries`.
  progress: [
    {
      user_id: MAX,
      source: "nyt",
      puzzle_date: isoDaysAgo(0).replace(/-/g, ""),
      puzzle_id: null,
      data: { entries: [["C", "", ""]], revealed: [], elapsed: 30, completed: false, filled: 1, total: 3 },
      client_updated_at: 1,
    },
    {
      user_id: MAX,
      source: null,
      puzzle_date: null,
      puzzle_id: "a1111111-0000-0000-0000-000000000001",
      data: { entries: [["C", "A", "T"]], revealed: [], elapsed: 95, completed: true, filled: 3, total: 3 },
      client_updated_at: 1,
    },
  ] as MockProgress[],
};

type TableName = keyof typeof db;

/** The seeded profiles, for the dev switcher to list. */
export const MOCK_PROFILES: MockProfile[] = db.profiles;

// ---------------------------------------------------------------------------
// Auth: an in-memory "current user", flippable from the dev switcher instead
// of real OAuth (there's no redirect target to fake in mock mode).
// ---------------------------------------------------------------------------

const MOCK_USER_KEY = "xword:mockUser";
type AuthListener = (event: string, session: unknown) => void;
const authListeners = new Set<AuthListener>();

function readStoredUser(): string | null {
  try {
    return localStorage.getItem(MOCK_USER_KEY);
  } catch {
    return null;
  }
}

let currentUserId: string | null = readStoredUser();

function sessionFor(userId: string | null) {
  if (!userId) return null;
  const profile = db.profiles.find((p) => p.user_id === userId);
  return {
    user: {
      id: userId,
      email: `${profile?.username ?? "user"}@mock.local`,
      user_metadata: { avatar_url: null, picture: null },
    },
  };
}

export function mockCurrentUserId(): string | null {
  return currentUserId;
}

export function mockSignIn(userId: string): void {
  currentUserId = userId;
  try {
    localStorage.setItem(MOCK_USER_KEY, userId);
  } catch {
    /* ignore */
  }
  const session = sessionFor(userId);
  for (const cb of authListeners) cb("SIGNED_IN", session);
}

export function mockSignOut(): void {
  currentUserId = null;
  try {
    localStorage.removeItem(MOCK_USER_KEY);
  } catch {
    /* ignore */
  }
  for (const cb of authListeners) cb("SIGNED_OUT", null);
}

function isFollowing(followerId: string, followeeId: string): boolean {
  return db.follows.some((f) => f.follower_id === followerId && f.followee_id === followeeId);
}

// Mirrors the real `puzzles` RLS SELECT policy: a plain listing (the home
// feed) never returns 'unlisted' rows — only get_puzzle_by_id, below, can
// reach one, and only if the caller already knows its id.
function isVisibleInFeed(p: MockPuzzle, viewerId: string | null): boolean {
  if (!viewerId) return false;
  if (p.author_id === viewerId) return true; // RLS's "own rows" clause — every tier
  if (p.visibility === "public") return isFollowing(viewerId, p.author_id);
  if (p.visibility === "mutual") {
    return isFollowing(viewerId, p.author_id) && isFollowing(p.author_id, viewerId);
  }
  return false; // 'unlisted' and 'draft' never appear in the plain feed listing
}

function isVisibleById(p: MockPuzzle, viewerId: string | null): boolean {
  if (p.visibility === "unlisted") return true;
  if (viewerId && p.author_id === viewerId) return true;
  return isVisibleInFeed(p, viewerId);
}

// ---------------------------------------------------------------------------
// list_archive_feed / get_puzzle_by_id — reimplemented in JS against the
// seed data so pagination, sorting and the future-date guard all behave the
// same way they do against the real SQL function.
// ---------------------------------------------------------------------------

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
  mutual_progress: ReturnType<typeof mockListMutualProgress>;
}

function tupleGt(a: [number, number, number, string], b: [number, number, number, string]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return a[3] > b[3];
}

function mockListArchiveFeed(params: {
  p_include_following: boolean;
  p_include_mine: boolean;
  p_cursor_neg_date: number | null;
  p_cursor_kind: number | null;
  p_cursor_tie: number | null;
  p_cursor_id: string | null;
  p_page_size: number;
}): RawFeedRow[] {
  const today = isoDaysAgo(0);
  const viewerId = currentUserId;

  // Each flag governs only its own rows — Following and Your puzzles are
  // independent chips now (mirrors the SQL function). Own drafts always stay
  // out: they route to the Builder, not the Solver.
  // A community puzzle's feed date is the one its author picked in the
  // builder, falling back to the day its row was created for puzzles that
  // never set one — mirrors puzzle_publish_date() on the SQL side.
  const pubDate = (p: MockPuzzle) => p.data.isoDate || p.created_at.slice(0, 10);
  const communityRows: RawFeedRow[] = db.puzzles
    .filter((p) => pubDate(p) <= today)
    .filter((p) =>
      p.author_id === viewerId
        ? params.p_include_mine && p.visibility !== "draft"
        : params.p_include_following,
    )
    .filter((p) => isVisibleInFeed(p, viewerId))
    .map((p) => ({
      kind: 0,
      item_id: p.id,
      iso_date: pubDate(p),
      title: p.title,
      source: null,
      weekday: null,
      author: null,
      author_id: p.author_id,
      completions: p.completions,
      neg_date: -Date.parse(`${pubDate(p)}T00:00:00Z`),
      tie: -Date.parse(p.created_at),
      // Mirrors community_puzzle_type() — explicit type, else cryptic/size.
      puzzle_type: puzzleTypeOf(p.data),
      mutual_progress: mockListMutualProgress({
        p_puzzle_id: p.id,
        p_source: null,
        p_puzzle_date: null,
      }),
    }));

  const syndicatedRows: RawFeedRow[] = db.syndicated_puzzles
    .filter((s) => s.iso_date <= today) // never leak a puzzle fetched ahead of its publish date
    .map((s) => ({
      kind: 1,
      item_id: `${s.source}:${s.puzzle_date}`,
      iso_date: s.iso_date,
      title: s.title,
      source: s.source,
      weekday: s.weekday,
      author: s.author,
      author_id: null,
      completions: null,
      neg_date: -Date.parse(`${s.iso_date}T00:00:00Z`),
      tie: s.source_priority,
      puzzle_type: null, // syndicated type derives from `source` client-side
      mutual_progress: mockListMutualProgress({
        p_puzzle_id: null,
        p_source: s.source,
        p_puzzle_date: s.puzzle_date,
      }),
    }));

  const merged = [...communityRows, ...syndicatedRows].sort((a, b) =>
    a.neg_date !== b.neg_date
      ? a.neg_date - b.neg_date
      : a.kind !== b.kind
        ? a.kind - b.kind
        : a.tie !== b.tie
          ? a.tie - b.tie
          : a.item_id < b.item_id
            ? -1
            : a.item_id > b.item_id
              ? 1
              : 0,
  );

  const afterCursor =
    params.p_cursor_neg_date == null
      ? merged
      : merged.filter((r) =>
          tupleGt(
            [r.neg_date, r.kind, r.tie, r.item_id],
            [params.p_cursor_neg_date!, params.p_cursor_kind!, params.p_cursor_tie!, params.p_cursor_id!],
          ),
        );

  return afterCursor.slice(0, params.p_page_size);
}

// Mirrors list_mutual_progress: summary fields only (never the entries),
// gated on a follow edge in both directions.
function mockListMutualProgress(params: {
  p_puzzle_id: string | null;
  p_source: string | null;
  p_puzzle_date: string | null;
}) {
  const viewerId = currentUserId;
  if (!viewerId) return [];
  return db.progress
    .filter((pr) => isFollowing(viewerId, pr.user_id) && isFollowing(pr.user_id, viewerId))
    .filter((pr) =>
      params.p_puzzle_id != null
        ? pr.puzzle_id === params.p_puzzle_id
        : pr.source === params.p_source && pr.puzzle_date === params.p_puzzle_date,
    )
    .map((pr) => {
      const d = pr.data as { completed?: boolean; filled?: number; total?: number };
      const prof = db.profiles.find((p) => p.user_id === pr.user_id);
      return {
        user_id: pr.user_id,
        username: prof?.username ?? "unknown",
        display_name: prof?.display_name ?? "Unknown",
        accent: prof?.accent ?? "yellow",
        completed: d.completed ?? false,
        filled: d.filled ?? 0,
        total: d.total ?? 0,
        updated_at: new Date(pr.client_updated_at).toISOString(),
      };
    })
    .sort(
      (a, b) =>
        Number(b.completed) - Number(a.completed) ||
        b.filled - a.filled ||
        a.username.localeCompare(b.username),
    );
}

function mockGetPuzzleById(id: string): MockPuzzle | null {
  const p = db.puzzles.find((r) => r.id === id);
  if (!p) return null;
  return isVisibleById(p, currentUserId) ? p : null;
}

// ---------------------------------------------------------------------------
// A minimal Postgrest-style query builder — only the chains the app actually
// calls (select/eq/neq/in/ilike/not/order/limit/maybeSingle/single, insert/
// update/upsert/delete) — over the in-memory tables above.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

class MockQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private singleMode: "one" | "maybe" | null = null;
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private onConflictCols: string[] | null = null;

  constructor(
    private rows: Row[],
    private setRows: (rows: Row[]) => void,
  ) {}

  select(): this {
    return this; // projection isn't modeled — seed rows already match the real column shape
  }
  eq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  ilike(col: string, pattern: string): this {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i");
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  not(col: string, op: string, val: unknown): this {
    if (op === "is" && val === null) this.filters.push((r) => r[col] != null);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.sort = { column: col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }
  single(): this {
    this.singleMode = "one";
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = payload;
    this.onConflictCols = opts?.onConflict?.split(",") ?? null;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  then<TResult1, TResult2>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => f(row));
  }

  private execute(): { data: unknown; error: { message: string } | null } {
    if (this.op === "select") {
      let result = this.rows.filter((r) => this.matches(r));
      if (this.sort) {
        const { column, ascending } = this.sort;
        result = [...result].sort((a, b) => {
          const av = a[column] as string | number;
          const bv = b[column] as string | number;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return ascending ? cmp : -cmp;
        });
      }
      if (this.limitN != null) result = result.slice(0, this.limitN);
      return this.finish(result);
    }

    if (this.op === "insert") {
      // Mirror the real tables' column defaults (id uuid, created_at now()) —
      // publishing reads the generated id back via .select("id").single().
      const toInsert = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...r,
      }));
      this.setRows([...this.rows, ...toInsert]);
      return this.finish(toInsert);
    }

    if (this.op === "update") {
      const updated: Row[] = [];
      const next = this.rows.map((r) => {
        if (!this.matches(r)) return r;
        const merged = { ...r, ...this.payload };
        updated.push(merged);
        return merged;
      });
      this.setRows(next);
      return this.finish(updated);
    }

    if (this.op === "upsert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      let next = [...this.rows];
      const keyCols = this.onConflictCols;
      for (const item of items) {
        const idx = keyCols ? next.findIndex((r) => keyCols.every((c) => r[c] === item[c])) : -1;
        if (idx >= 0) next[idx] = { ...next[idx], ...item };
        else next.push({ ...item });
      }
      this.setRows(next);
      return this.finish(items);
    }

    // delete
    const remaining = this.rows.filter((r) => !this.matches(r));
    const removed = this.rows.filter((r) => this.matches(r));
    this.setRows(remaining);
    return this.finish(removed);
  }

  private finish(rows: Row[]): { data: unknown; error: { message: string } | null } {
    if (this.singleMode === "one") {
      if (rows.length !== 1) return { data: null, error: { message: `expected exactly one row, got ${rows.length}` } };
      return { data: rows[0], error: null };
    }
    if (this.singleMode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: `expected at most one row, got ${rows.length}` } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
}

// ---------------------------------------------------------------------------
// Admin stats rpcs — a rough JS stand-in for 20261008000000_admin_stats.sql.
// The seed has no timestamps on profiles/progress, so "joined" and "last
// active" are synthesized; good enough to lay the page out against.
// ---------------------------------------------------------------------------

function mockIsAdmin(): boolean {
  return !!db.profiles.find((p) => p.user_id === currentUserId)?.is_admin;
}

const ADMIN_DENIED = { data: null, error: { message: "admin only", code: "42501" } };

const mockJoined = (i: number) => `${isoDaysAgo(40 - i * 9)}T08:00:00Z`;
const mockActive = (i: number) => `${isoDaysAgo(i)}T12:00:00Z`;

function mockUserRef(p: MockProfile) {
  return { user_id: p.user_id, username: p.username, display_name: p.display_name, accent: p.accent };
}

function mockLastActive(userId: string): string | null {
  const i = db.progress.findIndex((g) => g.user_id === userId);
  return i < 0 ? null : mockActive(i);
}

const isDone = (g: MockProgress) => !!(g.data as { completed?: boolean }).completed;
const elapsedOf = (g: MockProgress) => (g.data as { elapsed?: number }).elapsed ?? 0;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mockAdminOverview() {
  const done = db.progress.filter(isDone);
  const pub = (v: MockPuzzle["visibility"]) => db.puzzles.filter((p) => p.visibility === v).length;
  const followerCount = (id: string) => db.follows.filter((f) => f.followee_id === id).length;
  const bySource = new Map<string, MockProgress[]>();
  for (const g of db.progress) {
    if (!g.source) continue;
    bySource.set(g.source, [...(bySource.get(g.source) ?? []), g]);
  }
  return {
    generated_at: new Date().toISOString(),
    users: {
      total: db.profiles.length,
      new_7d: 1,
      new_30d: 2,
      unclaimed: 0,
      active_1d: 1,
      active_7d: new Set(db.progress.map((g) => g.user_id)).size,
      active_30d: new Set(db.progress.map((g) => g.user_id)).size,
      admins: db.profiles.filter((p) => p.is_admin).length,
    },
    solving: {
      started: db.progress.length,
      completed: done.length,
      completed_7d: done.length,
      completed_30d: done.length,
      median_seconds: median(done.map(elapsedOf)),
      clean: done.length,
      avg_rating: null,
    },
    community: {
      public: pub("public"),
      mutual: pub("mutual"),
      unlisted: pub("unlisted"),
      draft: pub("draft"),
      authors: new Set(db.puzzles.filter((p) => p.visibility !== "draft").map((p) => p.author_id)).size,
      new_30d: db.puzzles.filter((p) => p.visibility !== "draft").length,
      completions: db.puzzles.reduce((n, p) => n + p.completions, 0),
    },
    social: {
      follows: db.follows.length,
      mutual_pairs: db.follows.filter((f) => f.follower_id < f.followee_id && isFollowing(f.followee_id, f.follower_id)).length,
      following_anyone: new Set(db.follows.map((f) => f.follower_id)).size,
      new_30d: db.follows.length,
    },
    coop: { sessions: 0, completed: 0, open: 0, sessions_30d: 0, avg_players: null, messages: 0 },
    // Deterministic wiggle so the charts have something to draw.
    daily: Array.from({ length: 30 }, (_, i) => ({
      day: isoDaysAgo(29 - i),
      signups: i % 9 === 0 ? 1 : 0,
      active: 1 + ((i * 7) % 4),
      completed: (i * 5) % 6,
    })),
    sources: [...bySource].map(([source, rows]) => ({
      source,
      started: rows.length,
      completed: rows.filter(isDone).length,
      solvers: new Set(rows.map((g) => g.user_id)).size,
      median_seconds: median(rows.filter(isDone).map(elapsedOf)),
      avg_rating: null,
    })),
    top_puzzles: db.puzzles
      .filter((p) => p.visibility !== "draft")
      .sort((a, b) => b.completions - a.completions)
      .map((p) => {
        const a = db.profiles.find((x) => x.user_id === p.author_id);
        return {
          id: p.id,
          title: p.title,
          visibility: p.visibility,
          completions: p.completions,
          created_at: p.created_at,
          author_username: a?.username ?? null,
          author_display_name: a?.display_name ?? null,
        };
      }),
    most_followed: db.profiles
      .map((p) => ({ ...mockUserRef(p), followers: followerCount(p.user_id) }))
      .filter((p) => p.followers > 0)
      .sort((a, b) => b.followers - a.followers),
    top_solvers_30d: db.profiles
      .map((p) => ({ ...mockUserRef(p), completed: done.filter((g) => g.user_id === p.user_id).length }))
      .filter((p) => p.completed > 0)
      .sort((a, b) => b.completed - a.completed),
  };
}

function mockAdminSearchUsers(query: string, limit: number) {
  const q = query.trim().toLowerCase();
  return db.profiles
    .map((p, i) => ({
      ...mockUserRef(p),
      is_admin: p.is_admin,
      email: `${p.username}@mock.local`,
      created_at: mockJoined(i),
      last_active_at: mockLastActive(p.user_id),
      solved: db.progress.filter((g) => g.user_id === p.user_id && isDone(g)).length,
      following: db.follows.filter((f) => f.follower_id === p.user_id).length,
      followers: db.follows.filter((f) => f.followee_id === p.user_id).length,
      puzzles: db.puzzles.filter((x) => x.author_id === p.user_id && x.visibility !== "draft").length,
    }))
    .filter((u) => !q || [u.username, u.display_name, u.email].some((f) => f.toLowerCase().includes(q)))
    .slice(0, limit);
}

function mockAdminUserDetail(username: string) {
  const i = db.profiles.findIndex((p) => p.username === username.toLowerCase());
  if (i < 0) return null;
  const p = db.profiles[i];
  const mine = db.progress.filter((g) => g.user_id === p.user_id);
  const done = mine.filter(isDone);
  const edge = (other: string, at: string, mutual: boolean) => {
    const o = db.profiles.find((x) => x.user_id === other)!;
    return { ...mockUserRef(o), followed_at: at, mutual };
  };
  return {
    profile: {
      ...mockUserRef(p),
      is_admin: p.is_admin,
      created_at: mockJoined(i),
      email: `${p.username}@mock.local`,
      signed_up_at: mockJoined(i),
      last_sign_in_at: mockActive(1),
      provider: "google",
      last_active_at: mockLastActive(p.user_id),
    },
    stats: {
      started: mine.length,
      completed: done.length,
      completed_30d: done.length,
      clean: done.length,
      median_seconds: median(done.map(elapsedOf)),
      total_seconds: mine.reduce((n, g) => n + elapsedOf(g), 0),
      avg_rating: null,
      sessions: 0,
      messages: 0,
      active_days_30d: mine.length,
    },
    sources: [...new Set(mine.map((g) => g.source ?? "community"))].map((source) => {
      const rows = mine.filter((g) => (g.source ?? "community") === source);
      return { source, started: rows.length, completed: rows.filter(isDone).length };
    }),
    following: db.follows
      .filter((f) => f.follower_id === p.user_id)
      .map((f) => edge(f.followee_id, mockJoined(i), isFollowing(f.followee_id, p.user_id))),
    followers: db.follows
      .filter((f) => f.followee_id === p.user_id)
      .map((f) => edge(f.follower_id, mockJoined(i), isFollowing(p.user_id, f.follower_id))),
    puzzles: db.puzzles
      .filter((x) => x.author_id === p.user_id)
      .map((x) => ({
        id: x.id,
        title: x.title,
        visibility: x.visibility,
        completions: x.completions,
        created_at: x.created_at,
        width: x.data.width,
        height: x.data.height,
        solvers: db.progress.filter((g) => g.puzzle_id === x.id).length,
      })),
    solves: mine.map((g, j) => {
      const d = g.data as { elapsed?: number; filled?: number; total?: number; revealed?: string[]; rating?: number };
      const title = g.puzzle_id
        ? db.puzzles.find((x) => x.id === g.puzzle_id)?.title
        : db.syndicated_puzzles.find((x) => x.source === g.source && x.puzzle_date === g.puzzle_date)?.title;
      return {
        source: g.source,
        puzzle_date: g.puzzle_date,
        puzzle_id: g.puzzle_id,
        title: title ?? null,
        updated_at: mockActive(j),
        completed_at: isDone(g) ? mockActive(j) : null,
        elapsed: d.elapsed ?? null,
        filled: d.filled ?? null,
        total: d.total ?? null,
        revealed: d.revealed?.length ?? 0,
        rating: d.rating ?? null,
      };
    }),
    sessions: [],
  };
}

// ---------------------------------------------------------------------------

/** A duck-typed stand-in for the real SupabaseClient — cast at the one call
 *  site in supabase.ts. Only implements what's exercised above. */
export function createMockSupabase() {
  return {
    from(table: string) {
      const key = table as TableName;
      return new MockQueryBuilder(db[key] as unknown as Row[], (rows) => {
        (db[key] as unknown as Row[]).length = 0;
        (db[key] as unknown as Row[]).push(...rows);
      });
    },
    async rpc(name: string, params?: Record<string, unknown>) {
      if (name === "get_puzzle_by_id") {
        return { data: mockGetPuzzleById(params?.p_id as string), error: null };
      }
      if (name === "list_archive_feed") {
        return {
          data: mockListArchiveFeed(params as Parameters<typeof mockListArchiveFeed>[0]),
          error: null,
        };
      }
      if (name === "list_mutual_progress") {
        return {
          data: mockListMutualProgress(params as Parameters<typeof mockListMutualProgress>[0]),
          error: null,
        };
      }
      // The two solves projections: puzzle + mutuals' progress in one call,
      // mirroring the SQL functions that wrap the two rpcs above.
      if (name === "get_puzzle_with_solves") {
        const p = mockGetPuzzleById(params?.p_id as string);
        if (!p) return { data: null, error: null };
        return {
          data: {
            puzzle: p,
            mutual_progress: mockListMutualProgress({
              p_puzzle_id: p.id,
              p_source: null,
              p_puzzle_date: null,
            }),
          },
          error: null,
        };
      }
      if (name === "get_syndicated_with_solves") {
        const s = db.syndicated_puzzles.find(
          (row) => row.source === params?.p_source && row.puzzle_date === params?.p_puzzle_date,
        );
        if (!s) return { data: null, error: null };
        return {
          data: {
            puzzle: s.data,
            mutual_progress: mockListMutualProgress({
              p_puzzle_id: null,
              p_source: s.source,
              p_puzzle_date: s.puzzle_date,
            }),
          },
          error: null,
        };
      }
      if (name === "admin_overview") {
        return mockIsAdmin() ? { data: mockAdminOverview(), error: null } : ADMIN_DENIED;
      }
      if (name === "admin_search_users") {
        if (!mockIsAdmin()) return ADMIN_DENIED;
        return {
          data: mockAdminSearchUsers((params?.p_query as string) ?? "", (params?.p_limit as number) ?? 50),
          error: null,
        };
      }
      if (name === "admin_user_detail") {
        if (!mockIsAdmin()) return ADMIN_DENIED;
        return { data: mockAdminUserDetail(params?.p_username as string), error: null };
      }
      return { data: null, error: { message: `mockSupabase: unknown rpc "${name}"` } };
    },
    auth: {
      async getSession() {
        return { data: { session: sessionFor(currentUserId) } };
      },
      onAuthStateChange(callback: AuthListener) {
        authListeners.add(callback);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } };
      },
      async signInWithOAuth() {
        // No real OAuth to redirect to in mock mode — use the dev switcher
        // (mockSignIn) instead.
        return { error: { message: "Mock mode: use the account switcher to sign in." } };
      },
      async signOut() {
        mockSignOut();
        return { error: null };
      },
    },
  };
}
