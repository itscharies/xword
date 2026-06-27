import type { Crossword } from "../hooks/useCrossword.ts";

export function ClueBanner({ xw }: { xw: Crossword }) {
  const clue = xw.activeClue;
  return (
    <div className="clue-banner">
      <button className="nav" onClick={() => xw.moveToClue(-1)} aria-label="Previous clue">
        ‹
      </button>
      <button
        className="text"
        onClick={() => xw.toggleDirection()}
        aria-label="Switch direction (across/down)"
      >
        {clue ? (
          <>
            <b>
              {clue.number} {clue.direction === "across" ? "A" : "D"}
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
