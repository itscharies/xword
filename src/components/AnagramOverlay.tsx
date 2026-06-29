import { useEffect } from "react";
import type { AnagramPool } from "../hooks/useAnagramPool.ts";

/** Simplified mobile anagram helper: covers the grid, you type letters in from
 * the keyboard, and shuffle / view them in a circle or grid. Closing is handled
 * by toggling the keyboard's anagram key (no close button of its own). */
export function AnagramOverlay({ pool }: { pool: AnagramPool }) {
  const { letters, view, setView, add, backspace, shuffle } = pool;

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

  const radius = Math.min(95, 30 + letters.length * 8);

  return (
    <div className="ana-overlay" role="dialog" aria-label="Anagram helper">
      <div className={`ana-tiles ana-${view}`}>
        {letters.length === 0 ? (
          <span className="ana-empty">Type letters to anagram.</span>
        ) : (
          letters.map((t, i) => {
            const style =
              view === "circle"
                ? {
                    transform: `translate(-50%, -50%) translate(${
                      Math.cos((i / letters.length) * 2 * Math.PI - Math.PI / 2) *
                      radius
                    }px, ${
                      Math.sin((i / letters.length) * 2 * Math.PI - Math.PI / 2) *
                      radius
                    }px)`,
                  }
                : undefined;
            return (
              <span key={i} className="ana-tile" style={style}>
                {t}
              </span>
            );
          })
        )}
      </div>

      <div className="ana-controls">
        <button className="btn" onClick={shuffle} disabled={letters.length < 2}>
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
