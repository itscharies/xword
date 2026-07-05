import { useEffect, useRef, useState } from "react";
import type { Crossword } from "../hooks/useCrossword.ts";
import type { AnagramClueState, AnagramHelperStore, AnagramTile } from "../hooks/useAnagramPool.ts";
import { Modal } from "./Modal.tsx";
import { AnagramTiles } from "./AnagramTiles.tsx";
import { clueEnumeration, formatClue } from "../lib/clueFormat.ts";
import { shuffleTiles } from "../lib/anagram.ts";

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
/** Clue identity used to key the per-clue anagram-helper store. */
function clueKey(xw: Crossword): string {
  const c = xw.activeClue;
  return c ? `${c.number}${c.direction[0]}` : "";
}

export function AnagramHelper({
  xw,
  store,
  onClose,
}: {
  xw: Crossword;
  store: AnagramHelperStore;
  onClose: () => void;
}) {
  const clue = xw.activeClue;
  const key = clueKey(xw);
  const idRef = useRef(0);
  const toTiles = (s: string): AnagramTile[] =>
    s.split("").map((ch) => ({ id: idRef.current++, ch }));

  const [initial] = useState<AnagramClueState>(() => {
    const saved = store.get(key);
    if (saved) return saved;
    const seeded = wordLetters(xw).toUpperCase().replace(/[^A-Z]/g, "");
    return { pool: seeded, tiles: toTiles(seeded), view: "circle", answer: "" };
  });

  const [pool, setPool] = useState(initial.pool);
  const [tiles, setTiles] = useState<AnagramTile[]>(initial.tiles);
  const [view, setView] = useState<"circle" | "grid">(initial.view);
  const [answer, setAnswer] = useState(initial.answer);

  // Persist on every change so closing the helper (which unmounts it) doesn't
  // lose progress — reopening for the same clue restores this snapshot.
  useEffect(() => {
    store.set(key, { pool, tiles, view, answer });
  }, [store, key, pool, tiles, view, answer]);

  if (!clue) return null;

  const setLetters = (v: string) => {
    const up = v.toUpperCase().replace(/[^A-Z]/g, "");
    setPool(up);
    setTiles(toTiles(up));
  };
  const shuffle = () => setTiles(shuffleTiles);
  const clear = () => {
    setPool("");
    setTiles([]);
    setAnswer("");
  };
  const toggleLock = (id: number) =>
    setTiles((t) => t.map((tile) => (tile.id === id ? { ...tile, locked: !tile.locked } : tile)));
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
            }</b> ${formatClue(clue.clue)} (${clueEnumeration(clue)})`,
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
          onReorder={setTiles}
          onToggleLock={toggleLock}
          emptyText="Add some letters above."
        />

        <div className="ana-controls">
          <div className="ana-controls-group">
            <button className="btn" onClick={shuffle} disabled={tiles.length < 2}>
              Shuffle
            </button>
            <button className="btn" onClick={clear} disabled={tiles.length === 0}>
              Clear
            </button>
          </div>
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
