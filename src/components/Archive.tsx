import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, PAPERS, TYPES } from "../lib/sources.ts";
import { getFilters, setFilters, type Filters } from "../lib/theme.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { HowToPlay } from "./HowToPlay.tsx";
import { CheckIcon, FilterIcon, InfoIcon, SettingsIcon, UserIcon } from "./icons.tsx";
import { StarRating } from "./StarRating.tsx";
import { loadCommunityProgress, loadProgress, type Progress } from "../lib/storage.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { avatarUrl } from "../lib/auth.ts";
import { listArchivePage, type ArchiveFeedItem } from "../lib/puzzles.ts";

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
}: {
  onPick: (source: PuzzleSource, date: string) => void;
  onOpenAccount: () => void;
  onOpenPuzzle: (id: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { user } = useAuth();
  useDocumentTitle("");

  // Kept as one state object (rather than separate useState calls per field)
  // so every update — including "toggle one item in an array" — reads and
  // persists from the same up-to-date snapshot. Doing that as independent
  // setPapers/setTypes calls bit us before: each persisted using the other's
  // stale pre-update closure value, so whichever call ran last silently won
  // and could resurrect an already-cleared filter in localStorage.
  const [filters, setFiltersState] = useState(getFilters);
  const { papers, types, showFollowing, progress } = filters;

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
  const setShowFollowingFilter = (v: boolean) => {
    setFiltersState((f) => {
      const next = { ...f, showFollowing: v };
      setFilters(next);
      return next;
    });
  };
  const clearFilters = () => {
    const next: Filters = { papers: [], types: [], showFollowing: true, progress: [] };
    setFiltersState(next);
    setFilters(next);
  };

  const [items, setItems] = useState<ArchiveFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  // (Re)load from the top whenever sign-in state or the "people you follow"
  // toggle changes — both affect which rows the backend even returns, so a
  // client-side re-filter of already-loaded pages isn't enough.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listArchivePage({ includeFollowing: showFollowing }).then(({ items: page, nextCursor }) => {
      if (cancelled) return;
      setItems(page);
      setCursor(nextCursor);
      setHasMore(nextCursor !== null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showFollowing, user]);

  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore || cursor === null) return;
    loadingMoreRef.current = true;
    listArchivePage({ cursor, includeFollowing: showFollowing }).then(({ items: page, nextCursor }) => {
      setItems((prev) => [...prev, ...page]);
      setCursor(nextCursor);
      setHasMore(nextCursor !== null);
      loadingMoreRef.current = false;
    });
  }, [cursor, hasMore, showFollowing]);

  // The progress filter applies to every item, community or syndicated —
  // they just look their status up from a different store (keyed by puzzle
  // id for community, source/date for syndicated).
  const matchesProgress = (prog: Progress | null) =>
    progress.length === 0 || progress.includes(progressStatus(prog));

  // Papers/Type describe syndicated sources and don't apply to community
  // puzzles — once either is active, community puzzles (which match neither)
  // drop out of the filtered view along with every non-matching source.
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (it.kind === "syndicated") {
        const meta = SOURCES[it.source!];
        if (papers.length > 0 && !papers.includes(meta.paper)) return false;
        if (types.length > 0 && !types.includes(meta.type)) return false;
        return matchesProgress(loadProgress(it.source!, it.puzzleDate!));
      }
      if (papers.length > 0 || types.length > 0) return false;
      return matchesProgress(loadCommunityProgress(it.id));
    });
  }, [items, papers, types, progress]);

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

  // Load the next page when a sentinel near the bottom scrolls into view.
  const io = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      io.current?.disconnect();
      if (!node) return;
      io.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) loadMore();
        },
        { rootMargin: "1200px" },
      );
      io.current.observe(node);
    },
    [loadMore],
  );

  const filterCount = papers.length + types.length + progress.length + (showFollowing ? 0 : 1);

  return (
    <div className="app archive">
      <header className="header">
        <h1 className="archive-heading brand">The Daily Grid</h1>
        <div className="header-right">
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
            {avatarUrl(user) ? (
              <img className="account-btn-avatar" src={avatarUrl(user)!} alt="" />
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
        <div className="loading">Loading…</div>
      ) : (
        <>
          {days.length === 0 && (
            <div className="archive-empty">
              <p>No puzzles match these filters.</p>
              <button className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          {days.map(([iso, dayItems]) => (
            <section className="archive-day" key={iso}>
              <h2 className="archive-day-head">{formatDate(iso)}</h2>
              <ul className="archive-list">
                {dayItems.map((it) =>
                  it.kind === "community" ? (
                    <li key={it.id}>
                      <button className="archive-item" onClick={() => onOpenPuzzle(it.id)}>
                        <span className="ai-source">{it.title}</span>
                        <span className="ai-author">
                          By {it.authorProfile?.display_name} · @{it.authorProfile?.username}
                        </span>
                        {it.completions > 0 && (
                          <span className="ai-pct" title="Completions">
                            {it.completions} solved
                          </span>
                        )}
                      </button>
                    </li>
                  ) : (
                    <SyndicatedItem key={it.id} item={it} onPick={onPick} />
                  ),
                )}
              </ul>
            </section>
          ))}
        </>
      )}

      {!loading && hasMore && (
        <div className="archive-more">
          {/* Auto-loads as it nears view (real browsers); the button is a
              reliable fallback / manual control. */}
          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
          <button className="btn" onClick={loadMore}>
            Show more
          </button>
        </div>
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
              label="Papers"
              options={PAPERS}
              values={papers}
              onToggle={togglePaper}
              onClear={clearPapers}
            />

            {user && (
              <div className="setting-row">
                <span className="setting-label">People you follow</span>
                <div className="filter-chip-group" role="group" aria-label="People you follow">
                  <button
                    className={`filter-chip ${showFollowing ? "on" : ""}`}
                    onClick={() => setShowFollowingFilter(!showFollowing)}
                    role="checkbox"
                    aria-checked={showFollowing}
                  >
                    Show their puzzles in my feed
                  </button>
                </div>
              </div>
            )}

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

/** One syndicated puzzle row — its own component only so the per-item
 *  progress lookup below doesn't get lost among the community-item JSX. */
function SyndicatedItem({
  item,
  onPick,
}: {
  item: ArchiveFeedItem;
  onPick: (source: PuzzleSource, date: string) => void;
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
  const rating = prog?.rating ?? 0;
  // Cap at 99% while unsolved: a fully-filled grid with a wrong letter is
  // 100% filled but not "done", and showing 100% would look solved. 100%/the
  // tick is reserved for a correct solve.
  const pct = !done && prog?.total ? Math.min(99, Math.round((100 * (prog.filled ?? 0)) / prog.total)) : 0;
  return (
    <li>
      <button className={`archive-item ${done ? "done" : ""}`} onClick={() => onPick(source, date)}>
        <span className="ai-source">{mainLabel}</span>
        {theme && <span className="ai-theme">{theme}</span>}
        <span className="ai-author">By {item.author}</span>
        {rating > 0 && <StarRating value={rating} />}
        {done ? (
          <span className="ai-done" title="Solved" aria-label="Solved">
            <CheckIcon />
          </span>
        ) : pct > 0 ? (
          <span className="ai-pct" title={`${pct}% filled`}>
            {pct}%
          </span>
        ) : null}
      </button>
    </li>
  );
}
