import { useMemo } from "react";
import type { Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";
import type { RemoteCursor } from "../hooks/useSession.ts";

const keyOf = (r: number, c: number) => `${r},${c}`;

/** Pure grid renderer. In "fit width" mode it's used directly; in canvas
 *  mode GridCanvas wraps it in a pan/zoom viewport and handles keeping the
 *  active word in view. */
export function Grid({
  puzzle,
  xw,
  remoteCursors,
}: {
  puzzle: Puzzle;
  xw: Crossword;
  /** Co-op sessions: the other players' cursors — an accent-coloured ring
   *  plus an initial-letter badge on each cursored cell. */
  remoteCursors?: RemoteCursor[];
}) {
  const { grid, width, height } = puzzle;

  // Cell key -> the (at most two rendered) cursors sitting on it.
  const cursorsByCell = useMemo(() => {
    if (!remoteCursors || remoteCursors.length === 0) return null;
    const map = new Map<string, RemoteCursor[]>();
    for (const cur of remoteCursors) {
      const k = keyOf(cur.row, cur.col);
      const list = map.get(k) ?? [];
      if (list.length < 2) list.push(cur);
      map.set(k, list);
    }
    return map;
  }, [remoteCursors]);

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
          const afterBar = c > 0 && grid[r][c - 1].barRight;
          const remote = cursorsByCell?.get(k);
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
            afterBar ? "after-bar-r" : "",
            remote ? "remote" : "",
            remote && remote.length > 1 ? "remote-2" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const remoteStyle = remote
            ? ({
                "--rc": remote[0].color,
                ...(remote[1] ? { "--rc2": remote[1].color } : {}),
              } as React.CSSProperties)
            : undefined;
          return (
            <div
              key={k}
              className={cls}
              style={remoteStyle}
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
              {remote?.[0] && (
                <span
                  className="rc-badge"
                  style={{ background: remote[0].color }}
                  title={remote[0].displayName}
                >
                  {remote[0].letter}
                </span>
              )}
              {remote?.[1] && (
                <span
                  className="rc-badge rc-badge-2"
                  style={{ background: remote[1].color }}
                  title={remote[1].displayName}
                >
                  {remote[1].letter}
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
