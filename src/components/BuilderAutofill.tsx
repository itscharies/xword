import type { Builder } from "../hooks/useBuilder.ts";
import { slotCells } from "../lib/numbering.ts";
import { WandIcon } from "./icons.tsx";

/** The "fill it in for me" strip under the builder grid. Kicks off the
 *  background search and walks the fills as they stream in — the option
 *  count keeps climbing while the search runs, and each option appears as
 *  ghost letters on the grid until accepted. Ghost letters that vary across
 *  the options carry a dotted mark, and "Next here" cycles to a fill that
 *  changes the word under the cursor. */
export function BuilderAutofill({ b }: { b: Builder }) {
  const af = b.autofill;
  if (b.mode !== "fill") return null;

  // Cells of the word under the cursor, for the targeted "Next here" cycle —
  // offered only when the found fills actually disagree somewhere in it.
  const slotKeys = b.activeSlot
    ? slotCells(b.activeSlot).map((p) => `${p.row},${p.col}`)
    : [];
  const branchesHere =
    af.count > 1 && slotKeys.some((k) => af.branchCells.has(k));

  return (
    <div className="builder-autofill">
      {af.status === "idle" && (
        <button
          className="btn autofill-btn"
          onClick={af.start}
          disabled={!af.canStart}
          title={
            af.canStart
              ? "Search the word list for words that complete the grid"
              : "No empty squares to fill"
          }
        >
          <span className="btn-icon">
            <WandIcon />
          </span>
          Fill it in for me
        </button>
      )}

      {af.status === "running" && af.count === 0 && (
        <>
          <span className="autofill-msg" aria-live="polite">
            Searching for fills…
            {af.nodes >= 1000 && ` ${Math.round(af.nodes / 1000)}k words tried`}
          </span>
          <button className="btn" onClick={af.dismiss}>
            Cancel
          </button>
        </>
      )}

      {af.status === "done" && af.error && (
        <>
          <span className="autofill-msg">Autofill failed: {af.error}</span>
          <button className="btn" onClick={af.dismiss}>
            OK
          </button>
        </>
      )}

      {af.status === "done" && !af.error && af.count === 0 && (
        <>
          <span className="autofill-msg">
            {af.exhausted
              ? "No combination of words completes this grid — try freeing up some letters."
              : "Nothing found within the search budget — try filling a few more squares."}
          </span>
          <button className="btn" onClick={af.dismiss}>
            OK
          </button>
        </>
      )}

      {!af.error && af.count > 0 && (
        <>
          <span className="autofill-msg" aria-live="polite">
            Option {af.index + 1} of {af.count}
            {af.status === "running" && "… still searching"}
          </span>
          {af.count > 1 && (
            <button className="btn" onClick={() => af.cycle(1)}>
              Next
            </button>
          )}
          {branchesHere && (
            <button
              className="btn"
              onClick={() => af.cycleAt(slotKeys)}
              title="Jump to a fill that changes the word under the cursor"
            >
              Next here
            </button>
          )}
          <button className="btn autofill-accept" onClick={af.accept}>
            Accept
          </button>
          <button className="btn" onClick={af.dismiss}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
