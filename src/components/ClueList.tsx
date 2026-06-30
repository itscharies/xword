import { useEffect, useRef } from "react";
import type { Clue, Direction, Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";
import { formatClue } from "../lib/clueFormat.ts";

function Column({
  title,
  direction,
  clues,
  xw,
}: {
  title: string;
  direction: Direction;
  clues: Clue[];
  xw: Crossword;
}) {
  const activeNumber =
    xw.activeClue?.direction === direction ? xw.activeClue.number : null;
  // The crossing clue number (so the user sees both intersecting answers).
  const crossNumber =
    xw.activeClue?.direction !== direction
      ? xw.clueAt(xw.active.row, xw.active.col, direction)?.number ?? null
      : null;

  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeNumber]);

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
          return (
            <li
              key={clue.number}
              ref={active ? activeRef : undefined}
              className={[
                active ? "active" : "",
                crossing ? "crossing" : "",
                linked ? "linked" : "",
                isDone(clue) ? "done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => xw.selectClue({ ...clue, direction })}
            >
              <span className="cn">{clue.number}</span>
              <span className="ct">
                <span dangerouslySetInnerHTML={{ __html: formatClue(clue.clue) }} />
                {clue.enumeration && (
                  <span className="enum"> ({clue.enumeration})</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ClueList({ puzzle, xw }: { puzzle: Puzzle; xw: Crossword }) {
  return (
    <div className="clues">
      <Column title="Across" direction="across" clues={puzzle.clues.across} xw={xw} />
      <Column title="Down" direction="down" clues={puzzle.clues.down} xw={xw} />
    </div>
  );
}
