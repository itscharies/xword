import { useEffect, useRef } from "react";
import type { Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";

const keyOf = (r: number, c: number) => `${r},${c}`;

/** The scroll delta (to add to scrollLeft/scrollTop) that brings [lo, hi)
 *  fully inside [containerLo, containerHi) — used to fit the whole active
 *  word on screen. Falls back to fitting just [activeLo, activeHi) — the
 *  caret cell — when the full span is too big for the container at once, so
 *  a long word still ends with the caret on screen rather than snapping to
 *  one end of the word. */
function fitAxis(
  lo: number,
  hi: number,
  containerLo: number,
  containerHi: number,
  activeLo: number,
  activeHi: number,
): number {
  const fitsWhole = hi - lo <= containerHi - containerLo;
  const [targetLo, targetHi] = fitsWhole ? [lo, hi] : [activeLo, activeHi];
  if (targetLo < containerLo) return targetLo - containerLo; // scroll back
  if (targetHi > containerHi) return targetHi - containerHi; // scroll forward
  return 0;
}

export function Grid({ puzzle, xw }: { puzzle: Puzzle; xw: Crossword }) {
  const { grid, width, height } = puzzle;
  const { row: activeRow, col: activeCol } = xw.active;
  const activeCellRef = useRef<HTMLDivElement | null>(null);

  // In [data-grid-fit="fixed"] mode the grid can be bigger than its scroll
  // container (.board), so moving to a new cell or word (typing, arrow keys,
  // tapping a clue, switching direction on the same cell) needs to bring it
  // back into view — the whole word where it fits, else at least the caret.
  // Only wired up for that mode — in "fit width" the grid always fits, and
  // .board isn't a scroll container, so this would have nothing to do.
  useEffect(() => {
    if (document.documentElement.dataset.gridFit !== "fixed") return;
    const activeEl = activeCellRef.current;
    const board = activeEl?.closest<HTMLElement>(".board");
    if (!activeEl || !board) return;

    const wordEls = board.querySelectorAll<HTMLElement>(".cell.active, .cell.word");
    const activeRect = activeEl.getBoundingClientRect();
    let lo = { x: activeRect.left, y: activeRect.top };
    let hi = { x: activeRect.right, y: activeRect.bottom };
    wordEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      lo = { x: Math.min(lo.x, r.left), y: Math.min(lo.y, r.top) };
      hi = { x: Math.max(hi.x, r.right), y: Math.max(hi.y, r.bottom) };
    });

    const boardRect = board.getBoundingClientRect();
    board.scrollLeft += fitAxis(lo.x, hi.x, boardRect.left, boardRect.right, activeRect.left, activeRect.right);
    board.scrollTop += fitAxis(lo.y, hi.y, boardRect.top, boardRect.bottom, activeRect.top, activeRect.bottom);
  }, [activeRow, activeCol, xw.direction]);

  return (
    <div
      className="grid"
      style={
        {
          "--cols": width,
          "--rows": height,
        } as React.CSSProperties
      }
      role="grid"
      aria-label="Crossword grid"
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const k = keyOf(r, c);
          if (cell.black) {
            return (
              <div
                key={k}
                className={`cell ${cell.void ? "void" : "black"}`}
                aria-hidden
              />
            );
          }
          const isActive = xw.active.row === r && xw.active.col === c;
          const inWord = xw.highlighted.has(k);
          const isLinked = xw.linked.has(k);
          const entry = xw.entries[r][c];
          const cls = [
            "cell",
            cell.shaded ? "shaded" : "",
            isActive ? "active" : inWord ? "word" : isLinked ? "linked" : "",
            isActive && xw.rebus ? "rebus-sel" : "",
            xw.wrong.has(k) ? "wrong" : "",
            xw.revealed.has(k) ? "revealed" : "",
            entry.length > 1 ? "multi" : "",
            cell.barRight ? "bar-r" : "",
            cell.barBottom ? "bar-b" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={k}
              ref={isActive ? activeCellRef : undefined}
              className={cls}
              role="gridcell"
              onClick={() => xw.selectCell(r, c)}
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
