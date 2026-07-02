import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, PAPERS, TYPES } from "../lib/sources.ts";
import { getFilters, setFilters } from "../lib/theme.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { SaveDataControls } from "./SaveDataControls.tsx";
import { HowToPlay } from "./HowToPlay.tsx";
import { SignIn } from "./SignIn.tsx";
import { CheckIcon, UserIcon } from "./icons.tsx";
import { StarRating } from "./StarRating.tsx";
import { loadProgress } from "../lib/storage.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";

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

/** A labelled row of "All + each option" filter chips. */
function FilterRow({
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
    <div className="archive-filter" role="tablist" aria-label={`Filter by ${label}`}>
      <span className="filter-label">{label}</span>
      {["all", ...options].map((opt) => (
        <button
          key={opt}
          className={`filter-chip ${value === opt ? "on" : ""}`}
          onClick={() => onChange(opt)}
          role="tab"
          aria-selected={value === opt}
        >
          {opt === "all" ? "All" : opt}
        </button>
      ))}
    </div>
  );
}

/** The puzzle archive: a section per date, each holding that day's puzzles
 * across sources, with independent Paper and Size filters. */
export function Archive({
  index,
  onPick,
}: {
  index: PuzzleIndexEntry[];
  onPick: (source: PuzzleSource, date: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  // Re-renders (and thus re-reads every `loadProgress` call below) whenever
  // a sign-in reconcile finishes and rewrites localStorage underneath us.
  const { user } = useAuth();
  const [paper, setPaperState] = useState<string>(() => getFilters().paper);
  const [type, setTypeState] = useState<string>(() => getFilters().type);

  // Persist the filters so navigating into a puzzle and back keeps them.
  const setPaper = (p: string) => {
    setPaperState(p);
    setFilters({ paper: p, type });
  };
  const setType = (t: string) => {
    setTypeState(t);
    setFilters({ paper, type: t });
  };

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
            className="btn icon-btn cog-btn"
            onClick={() => setShowAccount(true)}
            aria-label={user ? "Account" : "Sign in"}
            title={user ? user.email : "Sign in"}
          >
            <UserIcon />
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

      <div className="archive-filters">
        <FilterRow
          label="Paper"
          options={PAPERS}
          value={paper}
          onChange={setPaper}
        />
        <FilterRow label="Type" options={TYPES} value={type} onChange={setType} />
      </div>

      {days.length === 0 && (
        <div className="archive-empty">
          <p>No puzzles match these filters.</p>
          <button
            className="btn"
            onClick={() => {
              setPaper("all");
              setType("all");
            }}
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

      {hasMore && (
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
          <SaveDataControls />
        </Modal>
      )}

      {showInfo && (
        <Modal title="How to play" onClose={() => setShowInfo(false)}>
          <HowToPlay />
        </Modal>
      )}

      {showAccount && (
        <Modal title="Account" onClose={() => setShowAccount(false)}>
          <SignIn />
        </Modal>
      )}
    </div>
  );
}
