import { useRef, useState } from "react";
import type { Builder } from "../hooks/useBuilder.ts";

const keyOf = (r: number, c: number) => `${r},${c}`;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Grid renderer for the builder. Every cell is interactive (black squares stay
 * clickable so they can be toggled back). Paint mode click/drag-paints black
 * squares with a crosshair cursor; fill mode selects cells — click, shift-click
 * to multi-select, or drag a marquee (shift-drag extends). Reuses the solver's
 * `.grid`/`.cell` classes.
 */
export function BuilderGrid({ b }: { b: Builder }) {
  const { grid, width, height, mode } = b;
  const containerRef = useRef<HTMLDivElement>(null);

  // Paint-mode drag: paint each entered cell to the first cell's target value.
  const painting = useRef(false);
  const paintBlack = useRef(false);

  // Fill-mode marquee: track the drag origin, whether it became a drag, and the
  // shift state at press. Preview cells + rectangle are component state so they
  // render live; the preview ref is read on release to commit the selection.
  const dragging = useRef(false);
  const start = useRef<{ r: number; c: number } | null>(null);
  const shiftStart = useRef(false);
  const moved = useRef(false);
  const previewRef = useRef<Set<string> | null>(null);
  const [preview, setPreview] = useState<Set<string> | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const cellsBetween = (
    a: { r: number; c: number },
    z: { r: number; c: number },
  ) => {
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = Math.min(a.r, z.r); r <= Math.max(a.r, z.r); r++)
      for (let c = Math.min(a.c, z.c); c <= Math.max(a.c, z.c); c++)
        cells.push({ row: r, col: c });
    return cells;
  };

  // Cell-aligned rectangle (union of the two cells' boxes), relative to grid.
  const rectBetween = (
    a: { r: number; c: number },
    z: { r: number; c: number },
  ): Rect | null => {
    const el = containerRef.current;
    if (!el) return null;
    const q = (r: number, c: number) =>
      el.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    const A = q(a.r, a.c);
    const Z = q(z.r, z.c);
    if (!A || !Z) return null;
    const cr = el.getBoundingClientRect();
    const ar = A.getBoundingClientRect();
    const zr = Z.getBoundingClientRect();
    const left = Math.min(ar.left, zr.left) - cr.left;
    const top = Math.min(ar.top, zr.top) - cr.top;
    return {
      left,
      top,
      width: Math.max(ar.right, zr.right) - cr.left - left,
      height: Math.max(ar.bottom, zr.bottom) - cr.top - top,
    };
  };

  const onCellDown = (r: number, c: number, e: React.PointerEvent) => {
    if (mode === "paint") {
      painting.current = true;
      paintBlack.current = !grid[r][c].black;
      b.setBlack(r, c, paintBlack.current);
      return;
    }
    // Fill: start a possible marquee; resolve to click vs drag on release.
    dragging.current = true;
    moved.current = false;
    start.current = { r, c };
    shiftStart.current = e.shiftKey;
    previewRef.current = null;
    setPreview(null);
    setRect(null);
  };

  const onCellEnter = (r: number, c: number) => {
    if (mode === "paint") {
      if (painting.current) b.setBlack(r, c, paintBlack.current);
      return;
    }
    if (!dragging.current || !start.current) return;
    moved.current = true;
    const set = new Set<string>();
    for (const p of cellsBetween(start.current, { r, c })) {
      if (!grid[p.row][p.col].black) set.add(keyOf(p.row, p.col));
    }
    previewRef.current = set;
    setPreview(set);
    setRect(rectBetween(start.current, { r, c }));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (mode === "paint") {
      painting.current = false;
      return;
    }
    if (!dragging.current || !start.current) return;
    dragging.current = false;
    const additive = shiftStart.current || e.shiftKey;
    if (moved.current && previewRef.current) {
      const cells = [...previewRef.current].map((k) => {
        const [r, c] = k.split(",").map(Number);
        return { row: r, col: c };
      });
      b.selectCells(cells, additive);
    } else {
      b.selectCell(start.current.r, start.current.c, additive);
    }
    start.current = null;
    previewRef.current = null;
    setPreview(null);
    setRect(null);
  };

  // Cells shown selected: the committed selection plus any live marquee preview.
  const selDisplay = new Set(b.selected);
  if (preview) for (const k of preview) selDisplay.add(k);

  return (
    <div
      ref={containerRef}
      className={`grid builder-grid ${mode === "paint" ? "paint-mode" : ""}`}
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
          const showSel = mode === "fill";
          const isActive =
            showSel &&
            b.selected.size === 0 &&
            b.active.row === r &&
            b.active.col === c;
          const isSelected = showSel && selDisplay.has(k);
          const inWord = b.highlighted.has(k);
          const isLinked = b.linkedCells.has(k);
          const entry = cell.solution ?? "";
          const cls = [
            "cell",
            cell.black ? "black" : "",
            cell.shaded ? "shaded" : "",
            isActive
              ? "active"
              : isSelected
                ? "selected"
                : inWord
                  ? "word"
                  : isLinked
                    ? "linked"
                    : "",
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
              data-r={r}
              data-c={c}
              onPointerDown={(e) => onCellDown(r, c, e)}
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
      {rect && (
        <div
          className="builder-marquee"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
    </div>
  );
}
