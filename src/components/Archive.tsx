import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, PAPERS, TYPES } from "../lib/sources.ts";
import { getFilters, setFilters } from "../lib/theme.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { HowToPlay } from "./HowToPlay.tsx";
import { CheckIcon, UserIcon } from "./icons.tsx";
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

const PERSON_PREFIX = "person:";

/** A labelled row of "All + each option" filter chips, used inside the
 *  filters modal. */
function FilterChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  // Nothing to filter on if there's only one option.
  if (options.length < 2) return null;
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      <div className="filter-chip-group" role="radiogroup" aria-label={label}>
        {["all", ...options].map((opt) => (
          <button
            key={opt}
            className={`filter-chip ${value === opt ? "on" : ""}`}
            onClick={() => onChange(opt)}
            role="radio"
            aria-checked={value === opt}
          >
            {opt === "all" ? "All" : opt}
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
  const [source, setSourceState] = useState<string>(() => getFilters().source);
  const [type, setTypeState] = useState<string>(() => getFilters().type);

  // Persist the filters so navigating into a puzzle and back keeps them.
  const setSource = (s: string) => {
    setSourceState(s);
    setFilters({ source: s, type });
  };
  const setType = (t: string) => {
    setTypeState(t);
    setFilters({ source, type: t });
  };
  // Clearing both at once as two separate setSource/setType calls would have
  // each persist using the other's stale (pre-clear) closure value — whoever
  // ran last would win and silently resurrect the just-cleared filter in
  // localStorage. Reset both in one write instead.
  const clearFilters = () => {
    setSourceState("all");
    setTypeState("all");
    setFilters({ source: "all", type: "all" });
  };

  // "Source" is one filter covering both the syndicated papers and, for a
  // specific followed person, their published puzzles instead — mutually
  // exclusive, so it's a single persisted value rather than two.
  const selectedPersonId = source.startsWith(PERSON_PREFIX)
    ? source.slice(PERSON_PREFIX.length)
    : null;
  const paper = selectedPersonId ? "all" : source;

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
      if (paper !== "all" && meta.paper !== paper) continue;
      if (type !== "all" && meta.type !== type) continue;
      const arr = byDate.get(p.isoDate);
      if (arr) arr.push(p);
      else byDate.set(p.isoDate, [p]);
    }
    return [...byDate.entries()];
  }, [index, paper, type]);

  // Render the archive a fortnight at a time and grow as the reader nears the
  // bottom — keeps the DOM small so scrolling 180+ days stays smooth.
  const PAGE = 14;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [paper, type]); // restart on filter change
  const visibleDays = days.slice(0, shown);
  const hasMore = shown < days.length;
  const filterCount = (source !== "all" ? 1 : 0) + (type !== "all" ? 1 : 0);

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
            ℹ
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
            ⚙
          </button>
        </div>
      </header>

      <div className="archive-filters-bar">
        <button className="btn filters-btn" onClick={() => setShowFilters(true)}>
          ▤ Filters{filterCount > 0 ? ` (${filterCount})` : ""}
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
              value={source}
              onChange={setSource}
            />

            {feedAuthors.length > 0 && (
              <div className="setting-row">
                <span className="setting-label">People you follow</span>
                <div className="filter-chip-group" role="radiogroup" aria-label="People you follow">
                  {feedAuthors.map((a) => (
                    <button
                      key={a.user_id}
                      className={`filter-chip ${source === `${PERSON_PREFIX}${a.user_id}` ? "on" : ""}`}
                      onClick={() => setSource(`${PERSON_PREFIX}${a.user_id}`)}
                      role="radio"
                      aria-checked={source === `${PERSON_PREFIX}${a.user_id}`}
                    >
                      {a.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!selectedPersonId && (
              <FilterChips label="Type" options={TYPES} value={type} onChange={setType} />
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
