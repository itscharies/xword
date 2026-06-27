import { useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControls } from "./ThemeControls.tsx";
import { CheckIcon } from "./icons.tsx";
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

/** Themed puzzles tack a name onto the title after the year, e.g.
 * "NY Times, Sun, Jun 21, 2026 Double Meanings" -> "Double Meanings". */
function themeName(title: string): string | null {
  const m = title.match(/\b\d{4}\b\s+(.+)$/);
  return m ? m[1] : null;
}

/** The puzzle archive: every available date, newest first. */
export function Archive({
  index,
  onPick,
}: {
  index: PuzzleIndexEntry[];
  onPick: (date: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);

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

      <ul className="archive-list">
        {index.map((p) => {
          const theme = themeName(p.title);
          const done = loadProgress(p.date)?.completed ?? false;
          return (
            <li key={p.date}>
              <button
                className={`archive-item ${done ? "done" : ""}`}
                onClick={() => onPick(p.date)}
              >
                <span className="ai-date">{formatDate(p.isoDate)}</span>
                {theme && <span className="ai-theme">{theme}</span>}
                <span className="ai-author">By {p.author}</span>
                {done && (
                  <span className="ai-done" title="Solved" aria-label="Solved">
                    <CheckIcon />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <ThemeControls />
        </Modal>
      )}
    </div>
  );
}
