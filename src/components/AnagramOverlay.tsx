import { useEffect } from "react";
import type { AnagramPool } from "../hooks/useAnagramPool.ts";
import { AnagramTiles } from "./AnagramTiles.tsx";

/** Simplified mobile anagram helper: covers the grid, you type letters in from
 * the keyboard, and shuffle / drag-to-reorder them in a circle or grid. Closing
 * is handled by toggling the keyboard's anagram key (no close button). */
export function AnagramOverlay({ pool }: { pool: AnagramPool }) {
  const { tiles, view, setView, add, backspace, shuffle, move } = pool;

  // Physical keyboard (narrow desktop) adds to the pool too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        add(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [add, backspace]);

  return (
    <div className="ana-overlay" role="dialog" aria-label="Anagram helper">
      <AnagramTiles
        tiles={tiles}
        view={view}
        onMove={move}
        emptyText="Type letters to anagram."
      />

      <div className="ana-controls">
        <button className="btn" onClick={shuffle} disabled={tiles.length < 2}>
          Shuffle
        </button>
        <div className="seg">
          <button
            className={`seg-btn ${view === "circle" ? "active" : ""}`}
            onClick={() => setView("circle")}
          >
            Circle
          </button>
          <button
            className={`seg-btn ${view === "grid" ? "active" : ""}`}
            onClick={() => setView("grid")}
          >
            Grid
          </button>
        </div>
      </div>
    </div>
  );
}
