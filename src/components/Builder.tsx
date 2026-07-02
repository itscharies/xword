import { useEffect, useRef, useState } from "react";
import { useBuilder } from "../hooks/useBuilder.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { getProfile } from "../lib/profile.ts";
import type { Puzzle } from "../types.ts";
import { BuilderGrid } from "./BuilderGrid.tsx";
import { BuilderClues } from "./BuilderClues.tsx";
import { BuilderSuggestions } from "./BuilderSuggestions.tsx";
import { MobileKeyboard } from "./MobileKeyboard.tsx";
import { RebusIcon } from "./RebusIcon.tsx";
import { Modal } from "./Modal.tsx";
import { PublishDialog } from "./PublishDialog.tsx";
import { Logo } from "./Logo.tsx";

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

/** Squares with no letter, or clues with no text — the same rough
 *  completeness check applies whether the puzzle is being exported or
 *  published. */
function puzzleWarnings(puzzle: Puzzle): string[] {
  const openCells = puzzle.grid.flat().filter((c) => !c.black);
  const missingLetters = openCells.some((c) => !c.solution);
  const missingClues = [...puzzle.clues.across, ...puzzle.clues.down].some(
    (c) => !c.clue.trim(),
  );
  const warnings: string[] = [];
  if (missingLetters) warnings.push("some squares have no letter");
  if (missingClues) warnings.push("some clues are empty");
  return warnings;
}

export function Builder({
  onOpenArchive,
  onOpenAccount,
}: {
  onOpenArchive: () => void;
  onOpenAccount: () => void;
}) {
  const b = useBuilder();
  const { user } = useAuth();
  const sizeIsSquare = b.linked;
  const formRef = useRef<HTMLDivElement>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

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
    const warnings = puzzleWarnings(puzzle);
    if (warnings.length) {
      const ok = window.confirm(
        `Heads up: ${warnings.join(" and ")}. Download anyway?`,
      );
      if (!ok) return;
    }
    const name = `${puzzle.date || "puzzle"}.json`;
    download(name, JSON.stringify(puzzle, null, 2));
  };

  const openPublish = () => {
    const puzzle = b.buildPuzzle();
    const warnings = puzzleWarnings(puzzle);
    if (warnings.length && !window.confirm(`Heads up: ${warnings.join(" and ")}. Publish anyway?`)) {
      return;
    }
    if (user) getProfile(user.id).then((p) => setHasProfile(Boolean(p)));
    setShowPublish(true);
  };

  return (
    <div className="app builder">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
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
        </div>
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

        {/* Per-cell decorations — toggles reflecting the active cell's state.
            Apply to the whole multi-selection when one is active. */}
        <div className="builder-group builder-decor">
          <button
            className={`btn ${b.activeProps.circled ? "active" : ""}`}
            onClick={() => b.toggleProp("circled")}
            aria-pressed={b.activeProps.circled}
            title="Circle"
          >
            ○ Circle
          </button>
          <button
            className={`btn ${b.activeProps.shaded ? "active" : ""}`}
            onClick={() => b.toggleProp("shaded")}
            aria-pressed={b.activeProps.shaded}
            title="Shading"
          >
            ▦ Shade
          </button>
          <button
            className={`btn ${b.activeProps.barRight ? "active" : ""}`}
            onClick={() => b.toggleProp("barRight")}
            aria-pressed={b.activeProps.barRight}
            title="Bar on the right edge"
          >
            ▕ Bar→
          </button>
          <button
            className={`btn ${b.activeProps.barBottom ? "active" : ""}`}
            onClick={() => b.toggleProp("barBottom")}
            aria-pressed={b.activeProps.barBottom}
            title="Bar on the bottom edge"
          >
            ▁ Bar↓
          </button>
        </div>
      </div>

      <div className="main builder-main">
        <div className="board">
          <BuilderGrid b={b} />
          <BuilderSuggestions b={b} />
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

        <div className="builder-export">
          {user && (
            <button className="btn" onClick={openPublish}>
              ⇪ Publish
            </button>
          )}
          <button className="btn btn-accent" onClick={onExport}>
            ⬇ Download JSON
          </button>
        </div>
      </div>

      {showPublish && (
        <Modal title="Publish puzzle" onClose={() => setShowPublish(false)}>
          {hasProfile === false ? (
            <div className="setting-row">
              <p>Set up a username on your Account page before publishing.</p>
              <button className="btn" onClick={onOpenAccount}>
                Go to Account
              </button>
            </div>
          ) : (
            <PublishDialog
              puzzle={b.buildPuzzle()}
              onClose={() => setShowPublish(false)}
            />
          )}
        </Modal>
      )}

      {/* Mobile fill-mode keyboard */}
      {b.mode === "fill" && (
        <div className="mobile-bar">
          <MobileKeyboard xw={b} onAnagram={() => {}} />
        </div>
      )}
    </div>
  );
}
