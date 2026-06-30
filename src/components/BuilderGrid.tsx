import { useRef } from "react";
import type { Builder } from "../hooks/useBuilder.ts";

const keyOf = (r: number, c: number) => `${r},${c}`;

/**
 * Grid renderer for the builder. Unlike the solver's `Grid`, every cell is
 * interactive — black squares must stay clickable so they can be toggled back.
 * Reuses the same `.grid`/`.cell` classes so it looks identical to the solver.
 */
export function BuilderGrid({ b }: { b: Builder }) {
  const { grid, width, height, mode } = b;
  // While dragging in paint mode, paint each cell the cursor enters to the same
  // black value as the first cell, so a drag doesn't flip cells back and forth.
  const dragging = useRef(false);
  const dragBlack = useRef(false);

  const onCellDown = (r: number, c: number) => {
    if (mode === "paint") {
      dragging.current = true;
      dragBlack.current = !grid[r][c].black;
      b.setBlack(r, c, dragBlack.current);
    } else {
      b.selectCell(r, c);
    }
  };
  const onCellEnter = (r: number, c: number) => {
    if (mode === "paint" && dragging.current) b.setBlack(r, c, dragBlack.current);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  return (
    <div
      className="grid builder-grid"
      style={
        {
          "--cols": width,
          "--rows": height,
        } as React.CSSProperties
      }
      role="grid"
      aria-label="Crossword builder grid"
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const k = keyOf(r, c);
          // Paint mode is about the black-square layout, not a cursor — hide
          // the selection/word highlight so it doesn't read as "selected".
          const showSel = mode === "fill";
          const isActive = showSel && b.active.row === r && b.active.col === c;
          const inWord = b.highlighted.has(k);
          const isLinked = b.linkedCells.has(k);
          const entry = cell.solution ?? "";
          const cls = [
            "cell",
            cell.black ? (cell.void ? "void" : "black") : "",
            cell.shaded ? "shaded" : "",
            isActive ? "active" : inWord ? "word" : isLinked ? "linked" : "",
            isActive && b.rebus ? "rebus-sel" : "",
            entry.length > 1 ? "multi" : "",
            cell.barRight ? "bar-r" : "",
            cell.barBottom ? "bar-b" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={k}
              className={cls}
              role="gridcell"
              onPointerDown={() => onCellDown(r, c)}
              onPointerEnter={() => onCellEnter(r, c)}
            >
              {cell.number !== undefined && (
                <span className="num">{cell.number}</span>
              )}
              {cell.circled && <span className="circle" />}
              {cell.barRight && <span className="sep sep-r" />}
              {cell.barBottom && <span className="sep sep-b" />}
              {entry && <span className="cell-letter">{entry}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}
