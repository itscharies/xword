import type { Builder } from "../hooks/useBuilder.ts";
import { WandIcon } from "./icons.tsx";

/** The "fill it in for me" strip under the builder grid. Kicks off the
 *  background search, shows its progress, then walks the returned fills:
 *  each option appears as ghost letters on the grid until accepted. */
export function BuilderAutofill({ b }: { b: Builder }) {
  const af = b.autofill;
  if (b.mode !== "fill") return null;

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

      {af.status === "running" && (
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

      {af.status === "done" && !af.error && af.count > 0 && (
        <>
          <span className="autofill-msg" aria-live="polite">
            Option {af.index + 1} of {af.count}
          </span>
          {af.count > 1 && (
            <button className="btn" onClick={() => af.cycle(1)}>
              Next
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
