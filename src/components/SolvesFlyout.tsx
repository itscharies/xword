import type { MutualProgress } from "../lib/puzzles.ts";
import { useFlyout } from "../hooks/useFlyout.ts";
import { Avatar } from "./Avatar.tsx";
import { AvatarStack } from "./AvatarStack.tsx";
import { CheckIcon } from "./icons.tsx";

/** The solver header's "solves" segment, beside the title/author block:
 *  the completion count (own puzzles) or a mutuals count, with tiny
 *  stacked avatars — hover (mouse) or tap (touch, a plain toggle) opens a
 *  flyout listing each mutual's progress (solved tick or % filled).
 *  Purely presentational: the mutuals list arrives projected onto the
 *  puzzle fetch itself (the *_with_solves RPCs), so there's no second
 *  request for this segment to pop in from. Renders nothing when there's
 *  neither a count to show nor a mutual who's started. */
export function SolvesFlyout({
  mutuals,
  completions,
}: {
  mutuals: MutualProgress[];
  /** Total solve count — only passed for the viewer's own puzzle, where the
   *  byline already showed it. */
  completions?: number;
}) {
  const { open, setOpen, wrapRef, hoverProps } = useFlyout<HTMLSpanElement>();

  // Only mutuals who've actually started — a row whose grid is still empty
  // (opened, typed nothing) would just read as noise.
  const started = mutuals.filter((m) => m.completed || m.filled > 0);

  // "On this" undersells a finished solve — a single mutual gets named with
  // their real status, and a group that has all finished gets "solved".
  const solvedCount = started.filter((m) => m.completed).length;
  const countText =
    completions != null
      ? `${completions} ${completions === 1 ? "person" : "people"} solved this`
      : started.length === 1
        ? `${started[0].display_name} ${started[0].completed ? "solved this" : "is on this"}`
        : solvedCount === started.length
          ? `${started.length} mutuals solved this`
          : `${started.length} mutuals on this`;

  if (completions == null && started.length === 0) return null;

  // A count with nobody to list stays plain text — nothing to fly out.
  if (started.length === 0) return <div className="solves-line">{countText}</div>;

  // The count is everyone; the list is mutuals only. Own up to the gap so
  // "2 people solved this" over a one-name list doesn't read as a bug.
  const others = completions != null ? completions - started.filter((m) => m.completed).length : 0;

  return (
    <div className="solves-line">
      <span
        ref={wrapRef}
        className={`solves-flyout ${open ? "open" : ""}`}
        {...hoverProps}
      >
        <button
          className="solves-trigger"
          aria-expanded={open}
          aria-label={`${countText} — show mutuals' progress`}
          onClick={() => setOpen((v) => !v)}
        >
          <AvatarStack people={started.slice(0, 4)} />
          {countText}
        </button>
        <div className="solves-panel" role="tooltip">
          {started.map((m) => {
            // Same 99% cap as the archive badges: filled isn't solved.
            const pct = m.completed
              ? 100
              : Math.min(99, Math.round((100 * m.filled) / Math.max(1, m.total)));
            return (
              <div className="solves-row" key={m.user_id}>
                <Avatar username={m.username} displayName={m.display_name} size={20} />
                <span className="solves-row-name">{m.display_name}</span>
                {m.completed ? (
                  <span className="solves-row-done" title="Solved" aria-label="Solved">
                    <CheckIcon />
                  </span>
                ) : (
                  <span className="solves-row-pct">{pct}%</span>
                )}
              </div>
            );
          })}
          {others > 0 && (
            <div className="solves-others">
              and {others} {others === 1 ? "other" : "others"}…
            </div>
          )}
        </div>
      </span>
    </div>
  );
}
