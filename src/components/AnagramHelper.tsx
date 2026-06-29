import { useEffect, useMemo, useState } from "react";
import type { Crossword } from "../hooks/useCrossword.ts";
import type { WordEntry } from "../hooks/useWordEntry.ts";
import { Modal } from "./Modal.tsx";
import { formatClue } from "../lib/clueFormat.ts";

/** Letters currently entered across the active word's cells. */
function wordLetters(xw: Crossword): string {
  const c = xw.activeClue;
  if (!c) return "";
  let s = "";
  for (let i = 0; i < c.len; i++) {
    const r = c.direction === "down" ? c.row + i : c.row;
    const col = c.direction === "across" ? c.col + i : c.col;
    s += xw.entries[r][col] || "";
  }
  return s;
}

/** The scrambled tiles + pool input + view toggle, shared by both layouts. */
function Tiles({
  pool,
  setLetters,
  tiles,
  view,
  setView,
  shuffle,
}: {
  pool: string;
  setLetters: (v: string) => void;
  tiles: string[];
  view: "circle" | "grid";
  setView: (v: "circle" | "grid") => void;
  shuffle: () => void;
}) {
  const radius = Math.min(95, 30 + tiles.length * 8);
  return (
    <>
      <label className="ana-row">
        <span className="ana-label">Letters</span>
        <input
          className="ana-input"
          value={pool}
          onChange={(e) => setLetters(e.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="add letters to anagram"
        />
      </label>

      <div className={`ana-tiles ${view}`}>
        {tiles.length === 0 ? (
          <span className="ana-empty">Add some letters above.</span>
        ) : (
          tiles.map((t, i) => {
            const style =
              view === "circle"
                ? {
                    transform: `translate(-50%, -50%) translate(${
                      Math.cos((i / tiles.length) * 2 * Math.PI - Math.PI / 2) *
                      radius
                    }px, ${
                      Math.sin((i / tiles.length) * 2 * Math.PI - Math.PI / 2) *
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
    </>
  );
}

/** An anagram aid for cryptic clues. On desktop it's a dialog where you type
 * the answer into a text box; on mobile it covers the grid and offers a
 * crossword-style entry (already-filled letters locked in their spots, the
 * blanks filled with the on-screen keyboard) plus the scrambled-letter pool. */
export function AnagramHelper({
  xw,
  onClose,
  mobile,
  entry,
}: {
  xw: Crossword;
  onClose: () => void;
  mobile: boolean;
  entry: WordEntry;
}) {
  const clue = xw.activeClue;
  const initial = useMemo(
    () => wordLetters(xw).toUpperCase().replace(/[^A-Z]/g, ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [pool, setPool] = useState(initial);
  const [tiles, setTiles] = useState<string[]>(() => initial.split(""));
  const [view, setView] = useState<"circle" | "grid">("circle");
  const [answer, setAnswer] = useState("");

  // On mobile the overlay owns the keyboard: route physical keys (narrow
  // desktop) into the answer entry, leaving the pool <input> to type natively.
  const { type, backspace } = entry;
  useEffect(() => {
    if (!mobile) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Escape") return onClose();
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        type(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile, type, backspace, onClose]);

  if (!clue) return null;

  const setLetters = (v: string) => {
    const up = v.toUpperCase().replace(/[^A-Z]/g, "");
    setPool(up);
    setTiles(up.split(""));
  };
  const shuffle = () =>
    setTiles((t) => {
      const a = [...t];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
  const fill = () => {
    if (!answer.trim()) return;
    xw.fillWord(answer);
    onClose();
  };

  const clueHtml = `<b>${clue.number}${
    clue.direction === "across" ? "A" : "D"
  }</b> ${formatClue(clue.clue)}`;

  const tilesProps = { pool, setLetters, tiles, view, setView, shuffle };

  if (!mobile) {
    return (
      <Modal title="Anagram helper" onClose={onClose}>
        <div className="anagram">
          <p
            className="ana-clue"
            dangerouslySetInnerHTML={{ __html: clueHtml }}
          />
          <Tiles {...tilesProps} />
          <div className="ana-row">
            <input
              className="ana-input"
              value={answer}
              onChange={(e) =>
                setAnswer(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
              }
              maxLength={clue.len}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={`Answer (${clue.len})`}
              onKeyDown={(e) => e.key === "Enter" && fill()}
            />
            <button
              className="btn btn-accent"
              onClick={fill}
              disabled={!answer.trim()}
            >
              Fill in
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Mobile: cover the grid. The answer row mirrors the crossword cells —
  // pre-filled letters are locked; blanks fill from the on-screen keyboard.
  return (
    <div className="ana-overlay" role="dialog" aria-label="Anagram helper">
      <div className="ana-overlay-head">
        <span className="ana-overlay-title">Anagram helper</span>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="anagram">
        <p className="ana-clue" dangerouslySetInnerHTML={{ __html: clueHtml }} />

        <div className="ana-answer">
          <span className="ana-label">Answer</span>
          <div className="ana-cells">
            {entry.positions.map((_, i) => (
              <button
                key={i}
                className={`ana-cell ${entry.locked[i] ? "locked" : ""} ${
                  !entry.locked[i] && entry.cursor === i ? "active" : ""
                }`}
                onClick={() => entry.select(i)}
              >
                {entry.letters[i]}
              </button>
            ))}
          </div>
        </div>

        <Tiles {...tilesProps} />
      </div>
    </div>
  );
}
