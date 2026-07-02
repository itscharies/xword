import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, PAPERS, TYPES } from "../lib/sources.ts";
import { getFilters, setFilters, type Filters } from "../lib/theme.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { HowToPlay } from "./HowToPlay.tsx";
import { CheckIcon, FilterIcon, InfoIcon, SettingsIcon, UserIcon } from "./icons.tsx";
import { StarRating } from "./StarRating.tsx";
import { loadProgress } from "../lib/storage.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { avatarUrl } from "../lib/auth.ts";
import { listFeed } from "../lib/puzzles.ts";

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

/** The puzzle archive: a section per date, each holding that day's puzzles
 * across sources, with independent Paper and Size filters. */
export function Archive({
  index,
  onPick,
  onOpenAccount,
  onOpenPuzzle,
}: {
  index: PuzzleIndexEntry[];
  onPick: (source: PuzzleSource, date: string) => void;
  onOpenAccount: () => void;
  onOpenPuzzle: (id: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Re-renders (and thus re-reads every `loadProgress` call below) whenever
  // a sign-in reconcile finishes and rewrites localStorage underneath us.
  const { user } = useAuth();
  useDocumentTitle("");

  const [feed, setFeed] = useState<Awaited<ReturnType<typeof listFeed>>>([]);
  useEffect(() => {
    if (!user) {
      setFeed([]);
      return;
    }
    listFeed(user.id).then(setFeed);
  }, [user]);
  // Kept as one state object (rather than separate useState calls per field)
  // so every update — including "toggle one item in an array" — reads and
  // persists from the same up-to-date snapshot. Doing that as independent
  // setPapers/setTypes calls bit us before: each persisted using the other's
  // stale pre-update closure value, so whichever call ran last silently won
  // and could resurrect an already-cleared filter in localStorage.
  const [filters, setFiltersState] = useState(getFilters);
  const { papers, types, person: selectedPersonId } = filters;

  const togglePaper = (p: string) => {
    setFiltersState((f) => {
      const papers = f.papers.includes(p) ? f.papers.filter((x) => x !== p) : [...f.papers, p];
      // Picking a paper exits "one person's puzzles" mode back into the
      // normal archive — the two views don't compose.
      const next = { ...f, papers, person: null };
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
  // Single-select and mutually exclusive with papers/types — picking a
  // person swaps the whole view to just their puzzles; clicking the same
  // one again (or picking a paper) swaps back.
  const selectPerson = (userId: string) => {
    setFiltersState((f) => {
      const next = { ...f, person: f.person === userId ? null : userId };
      setFilters(next);
      return next;
    });
  };
  const clearFilters = () => {
    const next: Filters = { papers: [], types: [], person: null };
    setFiltersState(next);
    setFilters(next);
  };

  // Only people who actually have a visible puzzle right now are worth
  // offering as a filter — de-duped in feed order (newest puzzle first).
  const feedAuthors = useMemo(() => {
    const seen = new Map<string, (typeof feed)[number]["author"]>();
    for (const p of feed) if (!seen.has(p.author.user_id)) seen.set(p.author.user_id, p.author);
    return [...seen.values()];
  }, [feed]);

  const personFeed = selectedPersonId
    ? feed.filter((p) => p.author.user_id === selectedPersonId)
    : [];
  const selectedPerson = feedAuthors.find((a) => a.user_id === selectedPersonId);

  // Group by date (index is pre-sorted newest-first, then by source order, so
  // insertion order into the Map is already what we want to render).
  const days = useMemo(() => {
    const byDate = new Map<string, PuzzleIndexEntry[]>();
    for (const p of index) {
      const meta = SOURCES[p.source];
      if (papers.length > 0 && !papers.includes(meta.paper)) continue;
      if (types.length > 0 && !types.includes(meta.type)) continue;
      const arr = byDate.get(p.isoDate);
      if (arr) arr.push(p);
      else byDate.set(p.isoDate, [p]);
    }
    return [...byDate.entries()];
  }, [index, papers, types]);

  // Render the archive a fortnight at a time and grow as the reader nears the
  // bottom — keeps the DOM small so scrolling 180+ days stays smooth.
  const PAGE = 14;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [papers, types]); // restart on filter change
  const visibleDays = days.slice(0, shown);
  const hasMore = shown < days.length;
  const filterCount = papers.length + types.length + (selectedPersonId ? 1 : 0);

  // Load the next page when a sentinel near the bottom scrolls into view.
  const io = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    io.current?.disconnect();
    if (!node) return;
    io.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setShown((n) => n + PAGE);
      },
      { rootMargin: "1200px" },
    );
    io.current.observe(node);
  }, []);

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

      {selectedPersonId ? (
        <section className="archive-day archive-feed">
          <h2 className="archive-day-head">
            {selectedPerson ? `Puzzles by ${selectedPerson.display_name}` : "Puzzles"}
          </h2>
          <ul className="archive-list">
            {personFeed.map((p) => (
              <li key={p.id}>
                <button className="archive-item" onClick={() => onOpenPuzzle(p.id)}>
                  <span className="ai-source">{p.title}</span>
                  <span className="ai-author">
                    By {p.author.display_name} · @{p.author.username}
                  </span>
                  {p.completions > 0 && (
                    <span className="ai-pct" title="Completions">
                      {p.completions} solved
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          {feed.length > 0 && (
            <section className="archive-day archive-feed">
              <h2 className="archive-day-head">From people you follow</h2>
              <ul className="archive-list">
                {feed.map((p) => (
                  <li key={p.id}>
                    <button className="archive-item" onClick={() => onOpenPuzzle(p.id)}>
                      <span className="ai-source">{p.title}</span>
                      <span className="ai-author">
                        By {p.author.display_name} · @{p.author.username}
                      </span>
                      {p.completions > 0 && (
                        <span className="ai-pct" title="Completions">
                          {p.completions} solved
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {days.length === 0 && (
            <div className="archive-empty">
              <p>No puzzles match these filters.</p>
              <button
                className="btn"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
          )}

          {visibleDays.map(([iso, items]) => (
            <section className="archive-day" key={iso}>
              <h2 className="archive-day-head">{formatDate(iso)}</h2>
              <ul className="archive-list">
                {items.map((p) => {
                  // NYT bakes the theme into a long title; the AmuseLabs sets use
                  // the theme as the title outright (date-only titles were already
                  // replaced with the source label at parse time, so a title that
                  // still differs from the label is a real theme — e.g. midi).
                  // "Other" (in-app authored) puzzles have no collection name, so
                  // their title stands in as the main label and isn't repeated.
                  const mainLabel =
                    p.source === "Other" ? p.title : SOURCES[p.source].label;
                  const theme =
                    p.source === "Other"
                      ? null
                      : p.source === "nyt"
                        ? themeName(p.title)
                        : p.title !== SOURCES[p.source].label
                          ? p.title
                          : null;
                  const prog = loadProgress(p.source, p.date);
                  const done = prog?.completed ?? false;
                  const rating = prog?.rating ?? 0;
                  // Cap at 99% while unsolved: a fully-filled grid with a wrong
                  // letter is 100% filled but not "done", and showing 100% would
                  // look solved. 100%/the tick is reserved for a correct solve.
                  const pct =
                    !done && prog?.total
                      ? Math.min(
                          99,
                          Math.round((100 * (prog.filled ?? 0)) / prog.total),
                        )
                      : 0;
                  return (
                    <li key={`${p.source}/${p.date}`}>
                      <button
                        className={`archive-item ${done ? "done" : ""}`}
                        onClick={() => onPick(p.source, p.date)}
                      >
                        <span className="ai-source">{mainLabel}</span>
                        {theme && <span className="ai-theme">{theme}</span>}
                        <span className="ai-author">By {p.author}</span>
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
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {!selectedPersonId && hasMore && (
        <div className="archive-more">
          {/* Auto-loads as it nears view (real browsers); the button is a
              reliable fallback / manual control. */}
          <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
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

            {feedAuthors.length > 0 && (
              <div className="setting-row">
                <span className="setting-label">People you follow</span>
                <div className="filter-chip-group" aria-label="People you follow">
                  {feedAuthors.map((a) => (
                    <button
                      key={a.user_id}
                      className={`filter-chip ${selectedPersonId === a.user_id ? "on" : ""}`}
                      onClick={() => selectPerson(a.user_id)}
                      aria-pressed={selectedPersonId === a.user_id}
                    >
                      {a.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!selectedPersonId && (
              <FilterChips
                label="Type"
                options={TYPES}
                values={types}
                onToggle={toggleType}
                onClear={clearTypes}
              />
            )}

            {filterCount > 0 && (
              <button
                className="btn"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
