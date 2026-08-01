import { useMemo } from "react";
import type { Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";
import { cursorClue, type RemoteCursor } from "../hooks/useSession.ts";

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

  // Remote cursors project two layers onto the grid: a ring + badge on the
  // exact cell each peer is on (`rings`), and a translucent tint of their
  // accent across their whole selected word (`fills`) — so you can see not
  // just where they are but which answer they're working, like your own
  // word highlight. Rings nest up to four per cell, each badge inset to sit
  // on its own ring; a fifth peer doesn't render. Tints never blend: the
  // first peer claims the cell, and the local player's own word highlight
  // always beats a remote tint (see the render below).
  const cursorLayers = useMemo(() => {
    if (!remoteCursors || remoteCursors.length === 0) return null;
    const rings = new Map<string, RemoteCursor[]>();
    const fills = new Map<string, string>();
    for (const cur of remoteCursors) {
      const k = keyOf(cur.row, cur.col);
      const ringList = rings.get(k) ?? [];
      if (ringList.length < 4) ringList.push(cur);
      rings.set(k, ringList);
      const clue = cursorClue(xw, cur);
      const cells = clue
        ? Array.from({ length: clue.len }, (_, i) =>
            keyOf(
              clue.direction === "down" ? clue.row + i : clue.row,
              clue.direction === "across" ? clue.col + i : clue.col,
            ),
          )
        : [k];
      for (const ck of cells) {
        if (!fills.has(ck)) fills.set(ck, cur.color);
      }
    }
    return { rings, fills };
  }, [remoteCursors, xw.clueAt]);

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
          const remote = cursorLayers?.rings.get(k);
          const remoteFills = cursorLayers?.fills.get(k);
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
          ]
            .filter(Boolean)
            .join(" ");
          // Rings nest inward, 3px per peer, then a single word tint floods
          // the rest of the cell (a giant inset shadow composites over any
          // background). The local player renders on top: their own active
          // cell and word keep their highlight untinted.
          const shadows = (remote ?? []).map(
            (cur, i) => `inset 0 0 0 ${(i + 1) * 3}px ${cur.color}`,
          );
          if (remoteFills && !isActive && !inWord) {
            shadows.push(
              `inset 0 0 0 999px color-mix(in srgb, ${remoteFills} 24%, transparent)`,
            );
          }
          const remoteStyle = shadows.length
            ? ({ boxShadow: shadows.join(", ") } as React.CSSProperties)
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
              {remote?.map((cur, i) => (
                <span
                  key={cur.sid}
                  className={`rc-badge${i > 0 ? ` rc-badge-${i + 1}` : ""}`}
                  style={{ background: cur.color }}
                  title={cur.displayName}
                >
                  {cur.letter}
                </span>
              ))}
            </div>
          );
        }),
      )}
    </div>
  );
}
