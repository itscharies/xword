import { useMemo, useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";
import type { PuzzleSource } from "../lib/sources.ts";
import { SOURCES, SOURCE_ORDER } from "../lib/sources.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { CheckIcon } from "./icons.tsx";
import { StarRating } from "./StarRating.tsx";
import { loadProgress } from "../lib/storage.ts";

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

type Filter = PuzzleSource | "all";

/** The puzzle archive: a section per date, each holding that day's puzzles
 * across sources, with a source filter. */
export function Archive({
  index,
  onPick,
}: {
  index: PuzzleIndexEntry[];
  onPick: (source: PuzzleSource, date: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  // Group by date (index is pre-sorted newest-first, then by source order, so
  // insertion order into the Map is already what we want to render).
  const days = useMemo(() => {
    const byDate = new Map<string, PuzzleIndexEntry[]>();
    for (const p of index) {
      if (filter !== "all" && p.source !== filter) continue;
      const arr = byDate.get(p.isoDate);
      if (arr) arr.push(p);
      else byDate.set(p.isoDate, [p]);
    }
    return [...byDate.entries()];
  }, [index, filter]);

  return (
    <div className="app archive">
      <header className="header">
        <h1 className="archive-heading">Crosswords</h1>
        <div className="header-right">
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

      <div className="archive-filter" role="tablist" aria-label="Filter by source">
        <button
          className={`filter-chip ${filter === "all" ? "on" : ""}`}
          onClick={() => setFilter("all")}
          role="tab"
          aria-selected={filter === "all"}
        >
          All
        </button>
        {SOURCE_ORDER.map((s) => (
          <button
            key={s}
            className={`filter-chip ${filter === s ? "on" : ""}`}
            onClick={() => setFilter(s)}
            role="tab"
            aria-selected={filter === s}
          >
            {SOURCES[s].short}
          </button>
        ))}
      </div>

      {days.map(([iso, items]) => (
        <section className="archive-day" key={iso}>
          <h2 className="archive-day-head">{formatDate(iso)}</h2>
          <ul className="archive-list">
            {items.map((p) => {
              const theme = p.source === "nyt" ? themeName(p.title) : null;
              const prog = loadProgress(p.source, p.date);
              const done = prog?.completed ?? false;
              const rating = prog?.rating ?? 0;
              const pct =
                !done && prog?.total
                  ? Math.round((100 * (prog.filled ?? 0)) / prog.total)
                  : 0;
              return (
                <li key={`${p.source}/${p.date}`}>
                  <button
                    className={`archive-item ${done ? "done" : ""}`}
                    onClick={() => onPick(p.source, p.date)}
                  >
                    <span className="ai-source">{SOURCES[p.source].label}</span>
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

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <ThemeControls />
        </Modal>
      )}
    </div>
  );
}
