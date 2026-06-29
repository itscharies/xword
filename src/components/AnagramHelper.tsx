import { useMemo, useRef, useState } from "react";
import type { Crossword } from "../hooks/useCrossword.ts";
import type { AnagramTile } from "../hooks/useAnagramPool.ts";
import { Modal } from "./Modal.tsx";
import { AnagramTiles } from "./AnagramTiles.tsx";
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

/** Desktop anagram aid for cryptic clues: shows the clue and a pool of letters
 * (seeded with whatever's filled in) that you can shuffle and drag to reorder
 * in a circle or grid, then type the answer to drop it into the grid. */
export function AnagramHelper({
  xw,
  onClose,
}: {
  xw: Crossword;
  onClose: () => void;
}) {
  const clue = xw.activeClue;
  const initial = useMemo(
    () => wordLetters(xw).toUpperCase().replace(/[^A-Z]/g, ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const idRef = useRef(0);
  const toTiles = (s: string): AnagramTile[] =>
    s.split("").map((ch) => ({ id: idRef.current++, ch }));

  const [pool, setPool] = useState(initial);
  const [tiles, setTiles] = useState<AnagramTile[]>(() => toTiles(initial));
  const [view, setView] = useState<"circle" | "grid">("circle");
  const [answer, setAnswer] = useState("");

  if (!clue) return null;

  const setLetters = (v: string) => {
    const up = v.toUpperCase().replace(/[^A-Z]/g, "");
    setPool(up);
    setTiles(toTiles(up));
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
  const move = (from: number, to: number) =>
    setTiles((t) => {
      if (from === to || from < 0 || to < 0 || from >= t.length || to >= t.length)
        return t;
      const a = [...t];
      const [x] = a.splice(from, 1);
      a.splice(to, 0, x);
      return a;
    });
  const fill = () => {
    if (!answer.trim()) return;
    xw.fillWord(answer);
    onClose();
  };

  return (
    <Modal title="Anagram helper" onClose={onClose}>
      <div className="anagram">
        <p
          className="ana-clue"
          dangerouslySetInnerHTML={{
            __html: `<b>${clue.number}${
              clue.direction === "across" ? "A" : "D"
            }</b> ${formatClue(clue.clue)}`,
          }}
        />

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

        <AnagramTiles
          tiles={tiles}
          view={view}
          onMove={move}
          emptyText="Add some letters above."
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
