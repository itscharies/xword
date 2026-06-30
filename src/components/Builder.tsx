import { useEffect, useRef } from "react";
import { useBuilder } from "../hooks/useBuilder.ts";
import { BuilderGrid } from "./BuilderGrid.tsx";
import { BuilderClues } from "./BuilderClues.tsx";
import { MobileKeyboard } from "./MobileKeyboard.tsx";
import { RebusIcon } from "./RebusIcon.tsx";

/** Serialize the built puzzle to a downloaded JSON file. */
function download(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function Builder({ onOpenArchive }: { onOpenArchive: () => void }) {
  const b = useBuilder();
  const sizeIsSquare = b.linked;
  const formRef = useRef<HTMLDivElement>(null);

  // Physical keyboard → builder, unless a text field (clue / metadata) is
  // focused, so typing into inputs doesn't leak into the grid.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT")) return;
      b.handleKeyDown(e);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [b.handleKeyDown]);

  const onExport = () => {
    const puzzle = b.buildPuzzle();
    const openCells = puzzle.grid.flat().filter((c) => !c.black);
    const missingLetters = openCells.some((c) => !c.solution);
    const missingClues = [...puzzle.clues.across, ...puzzle.clues.down].some(
      (c) => !c.clue.trim(),
    );
    const warnings: string[] = [];
    if (missingLetters) warnings.push("some squares have no letter");
    if (missingClues) warnings.push("some clues are empty");
    if (warnings.length) {
      const ok = window.confirm(
        `Heads up: ${warnings.join(" and ")}. Download anyway?`,
      );
      if (!ok) return;
    }
    const name = `${puzzle.date || "puzzle"}.json`;
    download(name, JSON.stringify(puzzle, null, 2));
  };

  return (
    <div className="app builder">
      <header className="header">
        <button
          className="title-block title-link"
          onClick={onOpenArchive}
          title="Back to archive"
        >
          <h1>Crossword builder</h1>
          <div className="byline">
            Lay out a grid, fill it in, export JSON · autosaved
          </div>
        </button>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm("Discard this draft and start a blank grid?"))
              b.clearDraft();
          }}
          title="Discard the saved draft and start fresh"
        >
          New / Clear
        </button>
      </header>

      <div className="builder-controls">
        {/* Grid size */}
        <div className="builder-group">
          <label className="builder-field">
            <span>{sizeIsSquare ? "Size" : "Width"}</span>
            <input
              type="number"
              min={1}
              max={40}
              value={b.width}
              onChange={(e) =>
                sizeIsSquare
                  ? b.setSize(+e.target.value)
                  : b.setWidth(+e.target.value)
              }
            />
          </label>
          <button
            className={`btn icon-btn ${sizeIsSquare ? "active" : ""}`}
            onClick={b.toggleLink}
            title={
              sizeIsSquare ? "Square (locked) — click to unlock" : "Unlocked"
            }
            aria-pressed={sizeIsSquare}
          >
            {sizeIsSquare ? "🔒" : "🔓"}
          </button>
          {!sizeIsSquare && (
            <label className="builder-field">
              <span>Height</span>
              <input
                type="number"
                min={1}
                max={40}
                value={b.height}
                onChange={(e) => b.setHeight(+e.target.value)}
              />
            </label>
          )}
        </div>

        {/* Mode */}
        <div className="seg">
          <button
            className={`seg-btn ${b.mode === "paint" ? "active" : ""}`}
            onClick={() => b.setMode("paint")}
          >
            ⬛ Paint
          </button>
          <button
            className={`seg-btn ${b.mode === "fill" ? "active" : ""}`}
            onClick={() => b.setMode("fill")}
          >
            ✎ Fill
          </button>
        </div>

        {/* Brush: solid block vs void (outside the puzzle) — paint mode only. */}
        {b.mode === "paint" && (
          <div className="seg" title="What clicking paints: a solid block or a void cell (outside the puzzle, for non-rectangular grids)">
            <button
              className={`seg-btn ${b.brush === "block" ? "active" : ""}`}
              onClick={() => b.setBrush("block")}
            >
              ⬛ Block
            </button>
            <button
              className={`seg-btn ${b.brush === "void" ? "active" : ""}`}
              onClick={() => b.setBrush("void")}
            >
              ▢ Void
            </button>
          </div>
        )}

        {/* Symmetry + rebus */}
        <button
          className={`btn ${b.symmetry ? "active" : ""}`}
          onClick={b.toggleSymmetry}
          aria-pressed={b.symmetry}
          title="Mirror black squares (180° rotational symmetry)"
        >
          ⤢ Symmetry
        </button>
        <button
          className={`btn rebus-btn ${b.rebus ? "active" : ""}`}
          onClick={b.toggleRebus}
          aria-pressed={b.rebus}
          disabled={b.mode !== "fill"}
          title="Rebus: type multiple letters in one square"
        >
          <RebusIcon />
        </button>

        {/* Per-cell decorations */}
        <div className="builder-group builder-decor">
          <button className="btn" onClick={() => b.toggleProp("circled")} title="Toggle circle">
            ○ Circle
          </button>
          <button className="btn" onClick={() => b.toggleProp("shaded")} title="Toggle shading">
            ▦ Shade
          </button>
          <button className="btn" onClick={() => b.toggleProp("barRight")} title="Toggle right bar">
            ▕ Bar→
          </button>
          <button className="btn" onClick={() => b.toggleProp("barBottom")} title="Toggle bottom bar">
            ▁ Bar↓
          </button>
        </div>
      </div>

      <div className="main builder-main">
        <div className="board">
          <BuilderGrid b={b} />
        </div>
        <BuilderClues b={b} />
      </div>

      {/* Metadata + export */}
      <div className="builder-meta" ref={formRef}>
        <label className="builder-field">
          <span>Title</span>
          <input value={b.title} onChange={(e) => b.setTitle(e.target.value)} />
        </label>
        <label className="builder-field">
          <span>Author</span>
          <input value={b.author} onChange={(e) => b.setAuthor(e.target.value)} />
        </label>
        <label className="builder-field">
          <span>Editor</span>
          <input value={b.editor} onChange={(e) => b.setEditor(e.target.value)} />
        </label>
        <label className="builder-field">
          <span>Date</span>
          <input type="date" value={b.date} onChange={(e) => b.setDate(e.target.value)} />
        </label>

        <div className="builder-settings">
          <div className="builder-setting">
            <span className="builder-field-label">Style</span>
            <div className="seg">
              <button
                className={`seg-btn ${!b.cryptic ? "active" : ""}`}
                onClick={() => b.cryptic && b.toggleCryptic()}
                aria-pressed={!b.cryptic}
              >
                Regular
              </button>
              <button
                className={`seg-btn ${b.cryptic ? "active" : ""}`}
                onClick={() => !b.cryptic && b.toggleCryptic()}
                aria-pressed={b.cryptic}
              >
                Cryptic
              </button>
            </div>
            <span
              className="builder-info"
              tabIndex={0}
              role="img"
              aria-label="About the puzzle style setting"
              title="Cryptic puzzles offer the anagram helper and show clue length enumerations like (3,4). Regular (American-style) puzzles do neither. Saved into the exported file as cryptic: true/false."
            >
              ⓘ
            </span>
          </div>

          <div className="builder-setting">
            <span className="builder-field-label">Clue lengths</span>
            <button
              className={`btn ${b.autoEnumerate ? "active" : ""}`}
              onClick={b.toggleAutoEnumerate}
              aria-pressed={b.autoEnumerate}
            >
              (#) {b.autoEnumerate ? "On" : "Off"}
            </button>
            <span
              className="builder-info"
              tabIndex={0}
              role="img"
              aria-label="About the clue lengths setting"
              title="On export, sets each clue's length enumeration like (3,4), split at any bars within the word. Switching to Cryptic turns this on; Regular turns it off."
            >
              ⓘ
            </span>
          </div>
        </div>

        <button className="btn btn-accent builder-export" onClick={onExport}>
          ⬇ Download JSON
        </button>
      </div>

      {/* Mobile fill-mode keyboard */}
      {b.mode === "fill" && (
        <div className="mobile-bar">
          <MobileKeyboard xw={b} onAnagram={() => {}} />
        </div>
      )}
    </div>
  );
}
