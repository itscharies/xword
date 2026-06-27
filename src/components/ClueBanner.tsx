import { useRef } from "react";
import type { Crossword } from "../hooks/useCrossword.ts";

// Drag distance (px) that maps to one grid cell of cursor movement.
const PX_PER_CELL = 16;
// Movement (px) before a press becomes a scrub rather than a tap.
const SCRUB_THRESHOLD = 6;

export function ClueBanner({ xw }: { xw: Crossword }) {
  const clue = xw.activeClue;

  const startX = useRef(0);
  const startY = useRef(0);
  const startRow = useRef(0);
  const startCol = useRef(0);
  const lastRow = useRef(-1);
  const lastCol = useRef(-1);
  const pressed = useRef(false);
  const scrubbing = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    pressed.current = true;
    scrubbing.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startRow.current = xw.active.row;
    startCol.current = xw.active.col;
    lastRow.current = xw.active.row;
    lastCol.current = xw.active.col;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic / unsupported pointers */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressed.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!scrubbing.current && Math.hypot(dx, dy) > SCRUB_THRESHOLD) {
      scrubbing.current = true;
    }
    if (!scrubbing.current) return;
    e.preventDefault();

    // Where the finger "points" in grid coordinates, relative to the start.
    const fr = startRow.current + dy / PX_PER_CELL;
    const fc = startCol.current + dx / PX_PER_CELL;

    // Move the cursor to the nearest open cell to that point.
    let best = null as { row: number; col: number } | null;
    let bestDist = Infinity;
    for (const p of xw.openCells) {
      const d = (p.row - fr) ** 2 + (p.col - fc) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best && (best.row !== lastRow.current || best.col !== lastCol.current)) {
      lastRow.current = best.row;
      lastCol.current = best.col;
      // Move only — keep the current across/down orientation.
      xw.moveTo(best.row, best.col);
    }
  };

  const onPointerUp = () => {
    // A tap (no scrub) keeps the old behaviour: switch direction.
    if (pressed.current && !scrubbing.current) xw.toggleDirection();
    pressed.current = false;
    scrubbing.current = false;
  };

  return (
    <div className="clue-banner">
      <button className="nav" onClick={() => xw.moveToClue(-1)} aria-label="Previous clue">
        ‹
      </button>
      <button
        className="text"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Tap to switch direction; drag to move the cursor"
      >
        {clue ? (
          <>
            <b>
              {clue.number}
              {clue.direction === "across" ? "A" : "D"}
            </b>
            <span>{clue.clue}</span>
          </>
        ) : (
          <span>Select a cell to begin</span>
        )}
      </button>
      <button className="nav" onClick={() => xw.moveToClue(1)} aria-label="Next clue">
        ›
      </button>
    </div>
  );
}
