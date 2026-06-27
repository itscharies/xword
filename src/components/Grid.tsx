import type { Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";

const keyOf = (r: number, c: number) => `${r},${c}`;

export function Grid({ puzzle, xw }: { puzzle: Puzzle; xw: Crossword }) {
  const { grid, width, height } = puzzle;

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
            xw.wrong.has(k) ? "wrong" : "",
            xw.revealed.has(k) ? "revealed" : "",
            entry.length > 1 ? "multi" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={k}
              className={cls}
              role="gridcell"
              onClick={() => xw.selectCell(r, c)}
            >
              {cell.number !== undefined && (
                <span className="num">{cell.number}</span>
              )}
              {cell.circled && <span className="circle" />}
              {entry && <span className="cell-letter">{entry}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}
