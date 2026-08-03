import { useEffect, useMemo, useRef } from "react";
import type { Clue, Direction, Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";
import { cursorClue, type RemoteCursor } from "../hooks/useSession.ts";
import { clueEnumeration, formatClue } from "../lib/clueFormat.ts";

function Column({
  title,
  direction,
  clues,
  xw,
  remote,
}: {
  title: string;
  direction: Direction;
  clues: Clue[];
  xw: Crossword;
  /** Co-op: "across-12" / "down-3" -> the peers whose cursor sits on that
   *  clue (up to four, matching the grid's stack cap). */
  remote: Map<string, RemoteCursor[]> | null;
}) {
  const activeNumber =
    xw.activeClue?.direction === direction ? xw.activeClue.number : null;
  // The crossing clue number (so the user sees both intersecting answers).
  const crossNumber =
    xw.activeClue?.direction !== direction
      ? xw.clueAt(xw.active.row, xw.active.col, direction)?.number ?? null
      : null;

  // The clue this column should scroll to: its own active clue, or — when
  // the active clue is in the other direction — the crossing one, so both
  // columns track the current word instead of only the typing direction.
  const currentNumber = activeNumber ?? crossNumber;

  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentNumber]);

  const isDone = (clue: Clue) => {
    for (let i = 0; i < clue.len; i++) {
      const r = direction === "down" ? clue.row + i : clue.row;
      const c = direction === "across" ? clue.col + i : clue.col;
      if (xw.entries[r][c] !== xw.solutionAt(r, c)) return false;
    }
    return true;
  };

  return (
    <div className="clue-col">
      <h2>{title}</h2>
      <ol ref={listRef}>
        {clues.map((clue) => {
          const active = clue.number === activeNumber;
          const crossing = clue.number === crossNumber;
          const linked = xw.linkedNumbers[direction].has(clue.number);
          const remoteHere = remote?.get(`${direction}-${clue.number}`);
          // A peer's clue renders like the local selection, in their accent:
          // the skinny bar on the side plus a light tint across the row. Only
          // the first peer paints — the rest keep their chip indicators (the
          // grid's no-blending rule) — and any row the local player owns
          // (their clue, its grey crossing clue, a linked clue) keeps its
          // own styling untouched.
          const localRow = active || crossing || linked;
          const remoteStyle =
            remoteHere && !localRow
              ? {
                  borderLeftColor: remoteHere[0].color,
                  boxShadow: `inset 0 0 0 999px color-mix(in srgb, ${remoteHere[0].color} 18%, transparent)`,
                }
              : undefined;
          return (
            <li
              key={clue.number}
              ref={clue.number === currentNumber ? activeRef : undefined}
              className={[
                active ? "active" : "",
                crossing ? "crossing" : "",
                linked ? "linked" : "",
                isDone(clue) ? "done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={remoteStyle}
              onClick={() => xw.selectClue({ ...clue, direction })}
            >
              <span className="cn">{clue.number}</span>
              <span className="ct">
                <span dangerouslySetInnerHTML={{ __html: formatClue(clue.clue) }} />
                <span className="enum"> ({clueEnumeration(clue)})</span>
              </span>
              {remoteHere && (
                <span className="clue-rc" aria-hidden>
                  {remoteHere.map((p) => (
                    <span
                      key={p.sid}
                      className="rc-badge-inline"
                      style={{ background: p.color }}
                      title={p.displayName}
                    >
                      {p.letter}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ClueList({
  puzzle,
  xw,
  remoteCursors,
}: {
  puzzle: Puzzle;
  xw: Crossword;
  /** Co-op sessions: peers' cursors — their selected clue renders like the
   *  local selection in their accent (side bar + light row tint) plus an
   *  initial-letter chip. First peer paints, the local player's rows win
   *  outright — matching the grid's rules. */
  remoteCursors?: RemoteCursor[];
}) {
  const remoteByClue = useMemo(() => {
    if (!remoteCursors || remoteCursors.length === 0) return null;
    const map = new Map<string, RemoteCursor[]>();
    for (const cur of remoteCursors) {
      const clue = cursorClue(xw, cur);
      if (!clue) continue;
      const k = `${clue.direction}-${clue.number}`;
      const list = map.get(k) ?? [];
      if (list.length < 4) list.push(cur);
      map.set(k, list);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteCursors, xw.clueAt]);

  return (
    <div className="clues">
      <Column
        title="Across"
        direction="across"
        clues={puzzle.clues.across}
        xw={xw}
        remote={remoteByClue}
      />
      <Column
        title="Down"
        direction="down"
        clues={puzzle.clues.down}
        xw={xw}
        remote={remoteByClue}
      />
    </div>
  );
}
