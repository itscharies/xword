import { useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, PAPERS, TYPES, TYPE_LABEL } from "../lib/sources.ts";
import { getFilters, setFilters, type Filters } from "../lib/theme.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { HowToPlay } from "./HowToPlay.tsx";
import { AboutPuzzles } from "./AboutPuzzles.tsx";
import { CheckIcon, DownloadIcon, FilterIcon, InfoIcon, PeopleIcon, SettingsIcon, UserIcon } from "./icons.tsx";
import { JoinSessionDialog } from "./JoinSessionDialog.tsx";
import { sessionsEnabled } from "../lib/session.ts";
import { ArchiveDaySkeleton, ArchiveSkeleton, Sk } from "./Skeleton.tsx";
import { loadCommunityProgress, loadProgress, type Progress } from "../lib/storage.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useFlyout } from "../hooks/useFlyout.ts";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { useProfile } from "../hooks/useProfile.ts";
import { useConnState } from "../hooks/useConnState.ts";
import { getConnState } from "../lib/online.ts";
import { listArchivePage, getPuzzleById, type ArchiveFeedItem, type MutualProgress } from "../lib/puzzles.ts";
import { getSyndicatedPuzzle } from "../lib/syndicated.ts";
import {
  listOfflinePuzzles,
  removePuzzleOffline,
  saveCommunityOffline,
  saveSyndicatedOffline,
  syndicatedOfflineKey,
  communityOfflineKey,
  type CachedPuzzle,
} from "../lib/offlineCache.ts";
import { Avatar } from "./Avatar.tsx";
import { AvatarStack } from "./AvatarStack.tsx";
import { Card } from "./Card.tsx";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Themed NYT puzzles tack a name onto the title after the year, e.g.
 * "NY Times, Sun, Jun 21, 2026 Double Meanings" -> "Double Meanings". */
function themeName(title: string): string | null {
  const m = title.match(/\b\d{4}\b\s+(.+)$/);
  return m ? m[1] : null;
}

const PROGRESS_STATUSES = ["Complete", "In progress", "Not started"] as const;

/** Days revealed per page — the archive loads and shows a week at a time. */
const DAYS_PER_PAGE = 7;
/** Rows per backend request: comfortably a week of ~11-puzzle days, so a
 *  week's page usually costs a single round-trip. */
const FETCH_PAGE_SIZE = 90;

/** Distinct days in a fetched batch that are provably complete: while more
 *  rows may follow, the oldest day could still be cut by the row-based page
 *  boundary, so it doesn't count until a row from an older day (or the
 *  feed's end) confirms it. */
function completeDayCount(list: ArchiveFeedItem[], more: boolean): number {
  const dates = new Set(list.map((it) => it.isoDate));
  return more && dates.size > 0 ? dates.size - 1 : dates.size;
}

/** The community entries in the Sources filter row — they sit beside the
 *  paper names and behave the same way (multi-select include; an empty
 *  selection means everything shows). */
const FOLLOWING_CHIP = "Following";
const MINE_CHIP = "Your puzzles";
const COMMUNITY_CHIPS: string[] = [FOLLOWING_CHIP, MINE_CHIP];

function progressStatus(prog: Progress | null): (typeof PROGRESS_STATUSES)[number] {
  if (prog?.completed) return "Complete";
  if (prog && (prog.filled ?? 0) > 0) return "In progress";
  return "Not started";
}

/** A labelled row of multi-select filter chips ("All" plus each option —
 *  any number of options can be on at once), used inside the filters modal. */
function FilterChips({
  label,
  options,
  values,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  // Nothing to filter on if there's only one option.
  if (options.length < 2) return null;
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="filter-chip-group" role="group" aria-label={label}>
        <button
          className={`filter-chip ${values.length === 0 ? "on" : ""}`}
          onClick={onClear}
          role="checkbox"
          aria-checked={values.length === 0}
        >
          All
        </button>
        {options.map((opt) => (
          <button
            key={opt}
            className={`filter-chip ${values.includes(opt) ? "on" : ""}`}
            onClick={() => onToggle(opt)}
            role="checkbox"
            aria-checked={values.includes(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The puzzle archive: one merged, backend-paginated feed of syndicated and
 *  community puzzles, grouped into a section per date, with Paper/Type/
 *  Progress filters and a show/hide toggle for puzzles from people you
 *  follow — they sort ahead of syndicated puzzles on a shared day rather
 *  than living in a separate section. */
export function Archive({
  onPick,
  onOpenAccount,
  onOpenPuzzle,
  onJoinSession,
}: {
  onPick: (source: PuzzleSource, date: string) => void;
  onOpenAccount: () => void;
  onOpenPuzzle: (id: string) => void;
  onJoinSession: (sessionId: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const { user } = useAuth();
  const profile = useProfile();
  useDocumentTitle("");

  // Which puzzles are saved for offline play, loaded once (a batch scan)
  // rather than per-tile — tiles just read `offlineKeys.has(key)` and call
  // `refreshOffline` after saving/removing, instead of each doing its own
  // async IndexedDB round-trip. The full list doubles as the offline
  // fallback view below, when the feed itself couldn't be fetched.
  const [offlinePuzzles, setOfflinePuzzles] = useState<CachedPuzzle[]>([]);
  const offlineKeys = useMemo(() => new Set(offlinePuzzles.map((p) => p.key)), [offlinePuzzles]);
  const refreshOffline = () => {
    listOfflinePuzzles().then(setOfflinePuzzles);
  };
  useEffect(refreshOffline, []);
  const online = useConnState() === "online";

  // Kept as one state object (rather than separate useState calls per field)
  // so every update — including "toggle one item in an array" — reads and
  // persists from the same up-to-date snapshot. Doing that as independent
  // setPapers/setTypes calls bit us before: each persisted using the other's
  // stale pre-update closure value, so whichever call ran last silently won
  // and could resurrect an already-cleared filter in localStorage.
  const [filters, setFiltersState] = useState(getFilters);
  const { papers: rawPapers, types, progress } = filters;
  // Signed out, the community chips aren't offered — drop any persisted
  // ones too, so a stale selection can't silently hide every paper.
  const papers = user ? rawPapers : rawPapers.filter((p) => !COMMUNITY_CHIPS.includes(p));

  // Which community rows the backend should even return. An empty Sources
  // selection means "no filter", so both kinds stay in; otherwise each kind
  // needs its chip. Paper chips alone don't refetch — they only narrow the
  // syndicated side, which is done client-side below.
  const includeFollowing = papers.length === 0 || papers.includes(FOLLOWING_CHIP);
  const includeMine = papers.length === 0 || papers.includes(MINE_CHIP);

  const togglePaper = (p: string) => {
    setFiltersState((f) => {
      const papers = f.papers.includes(p) ? f.papers.filter((x) => x !== p) : [...f.papers, p];
      const next = { ...f, papers };
      setFilters(next);
      return next;
    });
  };
  const toggleType = (t: string) => {
    setFiltersState((f) => {
      const types = f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t];
      const next = { ...f, types };
      setFilters(next);
      return next;
    });
  };
  const clearPapers = () => {
    setFiltersState((f) => {
      const next = { ...f, papers: [] };
      setFilters(next);
      return next;
    });
  };
  const clearTypes = () => {
    setFiltersState((f) => {
      const next = { ...f, types: [] };
      setFilters(next);
      return next;
    });
  };
  const toggleProgress = (p: string) => {
    setFiltersState((f) => {
      const progress = f.progress.includes(p) ? f.progress.filter((x) => x !== p) : [...f.progress, p];
      const next = { ...f, progress };
      setFilters(next);
      return next;
    });
  };
  const clearProgress = () => {
    setFiltersState((f) => {
      const next = { ...f, progress: [] };
      setFilters(next);
      return next;
    });
  };
  const clearFilters = () => {
    const next: Filters = { papers: [], types: [], progress: [] };
    setFiltersState(next);
    setFilters(next);
  };

  const [items, setItems] = useState<ArchiveFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);

  /** Fetch pages until `target` complete days are buffered (or the feed
   *  ends), returning the accumulated state — the caller decides whether to
   *  commit it, so a reload that starts mid-fetch can drop the stale run. */
  const fetchDays = async (
    target: number,
    from: { items: ArchiveFeedItem[]; cursor: string | null; hasMore: boolean },
  ) => {
    // Skip the doomed round-trip when already known offline — listArchivePage
    // would otherwise still attempt (and wait out) a network request that
    // Supabase's client normalizes into an empty result anyway.
    if (getConnState() === "offline") return { ...from, hasMore: false };
    let { items: acc, cursor: cur, hasMore: more } = from;
    while (more && completeDayCount(acc, more) < target) {
      const { items: page, nextCursor } = await listArchivePage({
        cursor: cur,
        pageSize: FETCH_PAGE_SIZE,
        includeFollowing,
        includeMine,
      });
      acc = [...acc, ...page];
      cur = nextCursor;
      more = nextCursor !== null;
      if (page.length === 0) break; // a bad page must not spin the loop forever
    }
    return { items: acc, cursor: cur, hasMore: more };
  };

  // Whether the *last completed* fetch came back empty because it couldn't
  // reach the feed at all — set once, when that fetch settles, rather than
  // read live off `online` at render time. `online` can flip back to true
  // later (e.g. the periodic reachability probe in lib/online.ts) without a
  // new fetch ever having run, and reading it directly at render time made
  // the offline puzzle list flash back to the misleading "No puzzles match
  // these filters" message a while after it first appeared, even though
  // nothing had actually been re-fetched.
  const [feedUnavailable, setFeedUnavailable] = useState(false);

  // (Re)load from the top whenever sign-in state or the Following/Your
  // puzzles chips change — all of these affect which rows the backend even
  // returns, so a client-side re-filter of already-loaded pages isn't
  // enough. Also reloads on an online/offline transition, so coming back
  // online automatically retries a feed that couldn't be reached, instead of
  // leaving the offline list showing indefinitely. The generation counter
  // also invalidates any in-flight Show more.
  const genRef = useRef(0);
  useEffect(() => {
    const gen = ++genRef.current;
    setLoading(true);
    setVisibleDays(DAYS_PER_PAGE);
    fetchDays(DAYS_PER_PAGE, { items: [], cursor: null, hasMore: true }).then((next) => {
      if (genRef.current !== gen) return;
      setItems(next.items);
      setCursor(next.cursor);
      setHasMore(next.hasMore);
      setFeedUnavailable(next.items.length === 0 && getConnState() === "offline");
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeFollowing, includeMine, user, online]);

  // The ref guards against double-clicks synchronously; the state drives the
  // in-flight placeholder.
  const loadingMoreRef = useRef(false);
  const loadMore = () => {
    if (loadingMoreRef.current || loading) return;
    const target = visibleDays + DAYS_PER_PAGE;
    const gen = genRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    fetchDays(target, { items, cursor, hasMore }).then((next) => {
      loadingMoreRef.current = false;
      if (genRef.current !== gen) return;
      setItems(next.items);
      setCursor(next.cursor);
      setHasMore(next.hasMore);
      setVisibleDays(target);
      setLoadingMore(false);
    });
  };

  // The progress filter applies to every item, community or syndicated —
  // they just look their status up from a different store (keyed by puzzle
  // id for community, source/date for syndicated).
  const matchesProgress = (prog: Progress | null) =>
    progress.length === 0 || progress.includes(progressStatus(prog));

  // The row-based fetch can cut the oldest buffered day in half, so hold
  // that day back until a later page (or the feed's end) confirms it's
  // complete — a day never renders with only some of its puzzles. If the
  // buffer is somehow a single day, show it anyway rather than nothing.
  const settledItems = useMemo(() => {
    if (!hasMore || items.length === 0) return items;
    const partialIso = items[items.length - 1].isoDate;
    const settled = items.filter((it) => it.isoDate !== partialIso);
    return settled.length > 0 ? settled : items;
  }, [items, hasMore]);

  // Reveal only the first `visibleDays` days of the settled buffer — a
  // fetch may overshoot the week, and the surplus stays banked for the next
  // Show more (which then reveals it without a network round-trip).
  const visibleItems = useMemo(() => {
    let seen = 0;
    let prevIso: string | null = null;
    const out: ArchiveFeedItem[] = [];
    for (const it of settledItems) {
      if (it.isoDate !== prevIso) {
        if (seen === visibleDays) break; // items arrive date-ordered
        seen++;
        prevIso = it.isoDate;
      }
      out.push(it);
    }
    return out;
  }, [settledItems, visibleDays]);

  // Whether Show more has anything left to reveal: unrevealed banked days,
  // or more rows behind the cursor.
  const settledDayCount = useMemo(
    () => new Set(settledItems.map((it) => it.isoDate)).size,
    [settledItems],
  );

  // The Sources row covers both worlds: paper chips match syndicated
  // puzzles, the Following/Your puzzles chips match community ones. Type
  // covers both too — syndicated items get theirs from their source's
  // metadata, community ones from their own type field (author-picked or
  // size-derived server-side).
  const filteredItems = useMemo(() => {
    return visibleItems.filter((it) => {
      if (it.kind === "syndicated") {
        const meta = SOURCES[it.source!];
        if (papers.length > 0 && !papers.includes(meta.paper)) return false;
        if (types.length > 0 && !types.includes(meta.type)) return false;
        return matchesProgress(loadProgress(it.source!, it.puzzleDate!));
      }
      if (types.length > 0 && !types.includes(TYPE_LABEL[it.type ?? "regular"])) return false;
      if (papers.length > 0) {
        const mine = !!user && it.authorProfile?.user_id === user.id;
        if (!papers.includes(mine ? MINE_CHIP : FOLLOWING_CHIP)) return false;
      }
      return matchesProgress(loadCommunityProgress(it.id));
    });
  }, [visibleItems, papers, types, progress, user]);

  // Group by date — items arrive from the server already sorted newest-day
  // first, community-before-syndicated within a day, so insertion order into
  // the Map is already what we want to render.
  const days = useMemo(() => {
    const byDate = new Map<string, ArchiveFeedItem[]>();
    for (const it of filteredItems) {
      const arr = byDate.get(it.isoDate);
      if (arr) arr.push(it);
      else byDate.set(it.isoDate, [it]);
    }
    return [...byDate.entries()];
  }, [filteredItems]);

  const filterCount = papers.length + types.length + progress.length;

  return (
    <div className="app archive">
      <header className="header">
        <h1 className="archive-heading brand">
          {/* A real navigation, not SPA routing: clicking the wordmark on the
              page it already lives on reloads fresh. */}
          <a className="brand-link" href={import.meta.env.BASE_URL}>
            The Daily Grid
          </a>
        </h1>
        <div className="header-right">
          {sessionsEnabled && (
            <button
              className="btn icon-btn cog-btn"
              onClick={() => setShowJoin(true)}
              aria-label="Join a session"
              title="Join a session"
            >
              <PeopleIcon />
            </button>
          )}
          <button
            className="btn icon-btn cog-btn"
            onClick={() => setShowInfo(true)}
            aria-label="How to play"
            title="How to play"
          >
            <InfoIcon />
          </button>
          <button
            className="btn icon-btn cog-btn account-btn"
            onClick={onOpenAccount}
            aria-label={user ? "Account" : "Sign in"}
            title={user ? user.email : "Sign in"}
          >
            {profile && profile !== "loading" ? (
              <Avatar
                username={profile.username}
                displayName={profile.display_name}
                accent={profile.accent}
                size={28}
              />
            ) : user && profile === "loading" ? (
              // Shimmer square where the avatar will land, instead of a
              // UserIcon that pops into an avatar a beat later.
              <Sk w={28} h={28} className="sk-avatar" />
            ) : (
              <UserIcon />
            )}
          </button>
          <button
            className="btn icon-btn cog-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      <div className="archive-filters-bar">
        <button className="btn filters-btn" onClick={() => setShowFilters(true)}>
          <FilterIcon /> Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
      </div>

      {loading ? (
        <ArchiveSkeleton />
      ) : (
        <>
          {days.length === 0 &&
            (feedUnavailable ? (
              // The feed fetch came back empty because it couldn't be
              // reached, not because nothing matched — showing the usual
              // "no matches" message would misreport a connectivity problem
              // as a filter problem. Show what's actually available instead.
              <OfflineFallback puzzles={offlinePuzzles} onPick={onPick} onOpenPuzzle={onOpenPuzzle} />
            ) : (
              <div className="archive-empty">
                <p>No puzzles match these filters.</p>
                <button className="btn" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ))}

          {days.map(([iso, dayItems]) => (
            <section className="archive-day" key={iso}>
              <h2 className="archive-day-head">{formatDate(iso)}</h2>
              <ul className="card-list">
                {dayItems.map((it) =>
                  it.kind === "community" ? (
                    <CommunityItem
                      key={it.id}
                      item={it}
                      onOpen={onOpenPuzzle}
                      offlineKeys={offlineKeys}
                      onOfflineChange={refreshOffline}
                    />
                  ) : (
                    <SyndicatedItem
                      key={it.id}
                      item={it}
                      onPick={onPick}
                      offlineKeys={offlineKeys}
                      onOfflineChange={refreshOffline}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}
        </>
      )}

      {/* While the next week is in flight, a day-shaped placeholder stands
          where its content will land, sized like the last rendered day. */}
      {loadingMore && <ArchiveDaySkeleton count={days[days.length - 1]?.[1].length ?? 4} />}

      {!loading && !loadingMore && (hasMore || settledDayCount > visibleDays) && (
        <div className="archive-more">
          <button className="btn" onClick={loadMore}>
            Show more
          </button>
        </div>
      )}

      <footer className="archive-footer">
        <p>Made with ❤️ by Caleb</p>
        <p>
          An independent project, unaffiliated with the papers whose puzzles
          appear here. All puzzles remain © their publishers and authors.
        </p>
        <button className="link-btn" onClick={() => setShowAbout(true)}>
          About the puzzles
        </button>
      </footer>

      {showAbout && (
        <Modal title="About the puzzles" onClose={() => setShowAbout(false)}>
          <AboutPuzzles />
        </Modal>
      )}

      {showJoin && (
        <JoinSessionDialog
          onJoin={(id) => {
            setShowJoin(false);
            onJoinSession(id);
          }}
          onClose={() => setShowJoin(false)}
        />
      )}

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <ThemeControls />
          {/* Signed-in progress lives in Supabase, not a local JSON backup. */}
          {!user && <SaveDataControls />}
        </Modal>
      )}

      {showInfo && (
        <Modal title="How to play" onClose={() => setShowInfo(false)}>
          <HowToPlay />
        </Modal>
      )}

      {showFilters && (
        <Modal title="Filters" onClose={() => setShowFilters(false)}>
          <div className="settings">
            <FilterChips
              label="Sources"
              options={user ? [...PAPERS, ...COMMUNITY_CHIPS] : PAPERS}
              values={papers}
              onToggle={togglePaper}
              onClear={clearPapers}
            />

            <FilterChips label="Type" options={TYPES} values={types} onToggle={toggleType} onClear={clearTypes} />

            <FilterChips
              label="Progress"
              options={[...PROGRESS_STATUSES]}
              values={progress}
              onToggle={toggleProgress}
              onClear={clearProgress}
            />

            {filterCount > 0 && (
              <button className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Shown in place of the archive feed when it's offline and the feed fetch
 *  came back empty — the puzzles saved via "Save offline" (the download icon
 *  on any tile, or in the Solver) are still openable even though the feed
 *  itself isn't reachable. */
function OfflineFallback({
  puzzles,
  onPick,
  onOpenPuzzle,
}: {
  puzzles: CachedPuzzle[];
  onPick: (source: PuzzleSource, date: string) => void;
  onOpenPuzzle: (id: string) => void;
}) {
  // Same grouping convention as the live feed above (a Map built in sorted
  // order, so insertion order is display order) — newest day first, one
  // section per date, so this reads as the same list rather than a
  // different, bolted-on view.
  const days = useMemo(() => {
    const sorted = [...puzzles].sort((a, b) => b.puzzle.isoDate.localeCompare(a.puzzle.isoDate));
    const byDate = new Map<string, CachedPuzzle[]>();
    for (const p of sorted) {
      const arr = byDate.get(p.puzzle.isoDate);
      if (arr) arr.push(p);
      else byDate.set(p.puzzle.isoDate, [p]);
    }
    return [...byDate.entries()];
  }, [puzzles]);

  if (puzzles.length === 0) {
    return (
      <div className="archive-empty">
        <p>You're offline, and don't have any puzzles saved for offline play yet.</p>
        <p className="ai-author">
          Next time you're online, look for the download icon on a puzzle to save it for later.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="archive-offline-notice">You're offline — here's what you've saved for later.</p>
      {days.map(([iso, dayPuzzles]) => (
        <section className="archive-day" key={iso}>
          <h2 className="archive-day-head">{formatDate(iso)}</h2>
          <ul className="card-list">
            {dayPuzzles.map((p) => (
              <Card
                key={p.key}
                onPress={() => (p.kind === "syndicated" ? onPick(p.source!, p.date!) : onOpenPuzzle(p.puzzleId!))}
              >
                <span className="ai-source">
                  {p.kind === "syndicated" ? SOURCES[p.source!].label : p.puzzle.title}
                </span>
                {p.kind === "syndicated" && p.puzzle.title !== SOURCES[p.source!].label && (
                  <span className="ai-theme">{p.puzzle.title}</span>
                )}
                <span className="ai-author">
                  {p.kind === "syndicated" ? `By ${p.puzzle.author || "Anonymous"}` : "Community puzzle"}
                </span>
              </Card>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Mutuals who've started this puzzle, as a tiny stacked-avatar strip in
 *  the tile's corner — the same data the solver page's flyout shows,
 *  projected onto the feed query so it costs no extra request. Hover (mouse)
 *  or tap (touch) opens a per-mutual flyout; the tap stops propagation so it
 *  doesn't also open the puzzle. The tile is already a button, so the stack
 *  can't be a focusable control of its own — keyboard/screen-reader users
 *  get the same detail from the aria-label instead. */
function MutualStack({ mutuals }: { mutuals: MutualProgress[] }) {
  const { open, setOpen, wrapRef, hoverProps } = useFlyout<HTMLSpanElement>();
  const started = mutuals.filter((m) => m.completed || m.filled > 0);
  if (started.length === 0) return null;
  // Same 99% cap as the tile's own badge: filled isn't solved.
  const pctOf = (m: MutualProgress) =>
    Math.min(99, Math.round((100 * m.filled) / Math.max(1, m.total)));
  const label = started
    .map((m) => (m.completed ? `${m.display_name} solved this` : `${m.display_name} ${pctOf(m)}%`))
    .join(" · ");
  // Everyone who's finished shares one stacked-avatar group and a single
  // tick; only the in-progress mutuals carry their own %. (The server sorts
  // completed first, so the slice favours finishers.)
  const shown = started.slice(0, 3);
  const finished = shown.filter((m) => m.completed);
  const partial = shown.filter((m) => !m.completed);
  return (
    <span
      ref={wrapRef}
      className={`ai-mutuals tip tip-right ${open ? "open" : ""}`}
      aria-label={label}
      {...hoverProps}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      {finished.length > 0 && (
        <span className="ai-mutual">
          <AvatarStack people={finished} />
          <span className="ai-mutual-done">
            <CheckIcon />
          </span>
        </span>
      )}
      {partial.map((m) => (
        <span className="ai-mutual" key={m.user_id}>
          <AvatarStack people={[m]} />
          <span className="ai-mutual-pct">{pctOf(m)}%</span>
        </span>
      ))}
      {started.length > 3 && <span className="ai-mutual-pct">+{started.length - 3}</span>}
      {/* Same row layout as the solver page's solves-panel, spans instead of
          divs because we're inside the tile's <button>. */}
      <span className="tip-panel" role="tooltip">
        {started.map((m) => (
          <span className="solves-row" key={m.user_id}>
            <Avatar username={m.username} displayName={m.display_name} accent={m.accent} size={20} />
            <span className="solves-row-name">{m.display_name}</span>
            {m.completed ? (
              <span className="solves-row-done">
                <CheckIcon />
              </span>
            ) : (
              <span className="solves-row-pct">{pctOf(m)}%</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

/** "Save offline" toggle, grouped with the .ai-done/.ai-pct progress badge
 *  in the tile's top-right corner (.ai-corner-group) rather than a corner of
 *  its own — the title text is left-aligned and flush with the card's edge,
 *  so a top-left badge collides with it, but the top-right corner is already
 *  established as reserved/badge space. Cards here are pressable (Card's
 *  onPress opens the puzzle), so this has to be a real nested <button>
 *  inside Card's default <li role="button"> rather than Card's as="button"
 *  variant — see the comment on Card.tsx — and its own click must stop
 *  propagation so tapping it doesn't also open the puzzle. */
function OfflineToggle({
  saved,
  saving,
  online,
  onToggle,
}: {
  saved: boolean;
  saving: boolean;
  online: boolean;
  onToggle: () => void;
}) {
  const disabled = saving || (!online && !saved);
  return (
    <button
      type="button"
      className={`ai-offline ${saved ? "on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={saved}
      aria-label={saved ? "Remove from offline puzzles" : "Save for offline play"}
      title={
        !online && !saved
          ? "Go online to save this for offline play"
          : saved
            ? "Saved for offline play — tap to remove"
            : "Save for offline play"
      }
    >
      <DownloadIcon />
    </button>
  );
}

/** One syndicated puzzle row — its own component only so the per-item
 *  progress lookup below doesn't get lost among the community-item JSX. */
function SyndicatedItem({
  item,
  onPick,
  offlineKeys,
  onOfflineChange,
}: {
  item: ArchiveFeedItem;
  onPick: (source: PuzzleSource, date: string) => void;
  offlineKeys: Set<string>;
  onOfflineChange: () => void;
}) {
  const source = item.source!;
  const date = item.puzzleDate!;
  // NYT bakes the theme into a long title; the AmuseLabs sets use the theme
  // as the title outright (date-only titles were already replaced with the
  // source label at parse time, so a title that still differs from the
  // label is a real theme — e.g. midi).
  const mainLabel = SOURCES[source].label;
  const theme =
    source === "nyt" ? themeName(item.title) : item.title !== SOURCES[source].label ? item.title : null;
  const prog = loadProgress(source, date);
  const done = prog?.completed ?? false;
  // Cap at 99% while unsolved: a fully-filled grid with a wrong letter is
  // 100% filled but not "done", and showing 100% would look solved. 100%/the
  // tick is reserved for a correct solve.
  const pct = !done && prog?.total ? Math.min(99, Math.round((100 * (prog.filled ?? 0)) / prog.total)) : 0;

  const offlineKey = syndicatedOfflineKey(source, date);
  const saved = offlineKeys.has(offlineKey);
  const [saving, setSaving] = useState(false);
  const online = useConnState() === "online";
  const toggleOffline = async () => {
    if (saving) return;
    setSaving(true);
    if (saved) {
      await removePuzzleOffline(offlineKey);
    } else {
      const puzzle = await getSyndicatedPuzzle(source, date);
      const result = puzzle
        ? await saveSyndicatedOffline(source, date, puzzle)
        : { ok: false as const, error: "Couldn't fetch this puzzle to save — try again once you're online." };
      if (!result.ok) window.alert(result.error);
    }
    setSaving(false);
    onOfflineChange();
  };

  return (
    <Card onPress={() => onPick(source, date)}>
      <span className="ai-source">{mainLabel}</span>
      {theme && <span className="ai-theme">{theme}</span>}
      <span className="ai-author">By {item.author || "Anonymous"}</span>
      <MutualStack mutuals={item.mutualProgress} />
      <div className="ai-corner-group">
        <OfflineToggle saved={saved} saving={saving} online={online} onToggle={toggleOffline} />
        {done ? (
          <span className="ai-done" title="Solved" aria-label="Solved">
            <CheckIcon />
          </span>
        ) : pct > 0 ? (
          <span className="ai-pct" title={`${pct}% filled`}>
            {pct}%
          </span>
        ) : null}
      </div>
    </Card>
  );
}

/** One community (user-authored) puzzle row. Shows the viewer's own progress
 *  tick/percentage — same as a syndicated row — rather than an aggregate
 *  "N solved" count, so it reads consistently with the rest of the list. */
function CommunityItem({
  item,
  onOpen,
  offlineKeys,
  onOfflineChange,
}: {
  item: ArchiveFeedItem;
  onOpen: (id: string) => void;
  offlineKeys: Set<string>;
  onOfflineChange: () => void;
}) {
  const { user } = useAuth();
  const isMine = !!user && item.authorProfile?.user_id === user.id;
  const prog = loadCommunityProgress(item.id);
  const done = prog?.completed ?? false;
  const pct = !done && prog?.total ? Math.min(99, Math.round((100 * (prog.filled ?? 0)) / prog.total)) : 0;

  const offlineKey = communityOfflineKey(item.id);
  const saved = offlineKeys.has(offlineKey);
  const [saving, setSaving] = useState(false);
  const online = useConnState() === "online";
  const toggleOffline = async () => {
    if (saving) return;
    setSaving(true);
    if (saved) {
      await removePuzzleOffline(offlineKey);
    } else {
      const published = await getPuzzleById(item.id);
      const result = published
        ? await saveCommunityOffline(item.id, published.data, published.author_id)
        : { ok: false as const, error: "Couldn't fetch this puzzle to save — try again once you're online." };
      if (!result.ok) window.alert(result.error);
    }
    setSaving(false);
    onOfflineChange();
  };

  return (
    <Card onPress={() => onOpen(item.id)}>
      <div className="ai-row">
        {item.authorProfile && (
          <Avatar
            username={item.authorProfile.username}
            displayName={item.authorProfile.display_name}
            accent={item.authorProfile.accent}
            size={36}
          />
        )}
        <div className="ai-row-text">
          <span className="ai-source">{item.title}</span>
          <span className="ai-author">
            {isMine ? "By you" : `By ${item.authorProfile?.display_name} · @${item.authorProfile?.username}`}
            {/* Only the non-default types get a tag — "Crossword" on every
                regular row would just be noise. */}
            {(item.type === "mini" || item.type === "cryptic") && ` · ${TYPE_LABEL[item.type]}`}
          </span>
        </div>
      </div>
      <MutualStack mutuals={item.mutualProgress} />
      <div className="ai-corner-group">
        <OfflineToggle saved={saved} saving={saving} online={online} onToggle={toggleOffline} />
        {done ? (
          <span className="ai-done" title="Solved" aria-label="Solved">
            <CheckIcon />
          </span>
        ) : pct > 0 ? (
          <span className="ai-pct" title={`${pct}% filled`}>
            {pct}%
          </span>
        ) : null}
      </div>
    </Card>
  );
}
