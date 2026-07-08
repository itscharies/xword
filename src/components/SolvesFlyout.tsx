import { useEffect, useRef, useState } from "react";
import type { PuzzleSource } from "../lib/sources.ts";
import { listMutualProgress, type MutualProgress } from "../lib/puzzles.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { Avatar } from "./Avatar.tsx";
import { CheckIcon } from "./icons.tsx";

/** The solver header's "solves" line, under the byline: the completion
 *  count (own puzzles) or a mutuals count, with tiny stacked avatars —
 *  hover (mouse) or tap (touch, a plain toggle) opens a flyout listing
 *  each mutual's progress (solved tick or % filled). Renders nothing when
 *  there's neither a count to show nor a mutual who's started, so the solo
 *  path keeps its plain header. */
export function SolvesFlyout({
  communityId,
  source,
  date,
  completions,
}: {
  /** Set for a published (/p/<id>) puzzle; source/date cover syndicated. */
  communityId?: string;
  source?: PuzzleSource;
  date?: string;
  /** Total solve count — only passed for the viewer's own puzzle, where the
   *  byline already showed it. */
  completions?: number;
}) {
  const { user } = useAuth();
  const [mutuals, setMutuals] = useState<MutualProgress[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMutuals([]);
    if (!user) return;
    let cancelled = false;
    const key = communityId
      ? { puzzleId: communityId }
      : source && date
        ? { source, date }
        : null;
    if (!key) return;
    listMutualProgress(key).then((rows) => {
      if (!cancelled) setMutuals(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [user, communityId, source, date]);

  // Tap-elsewhere dismissal — blur is no good for it (iOS never focuses
  // buttons on tap), so watch the document while open.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  // Only mutuals who've actually started — a row whose grid is still empty
  // (opened, typed nothing) would just read as noise.
  const started = mutuals.filter((m) => m.completed || m.filled > 0);

  const countText =
    completions != null
      ? `${completions} ${completions === 1 ? "person" : "people"} solved this`
      : `${started.length} ${started.length === 1 ? "mutual" : "mutuals"} on this`;

  if (completions == null && started.length === 0) return null;

  // A count with nobody to list stays plain text — nothing to fly out.
  if (started.length === 0) return <div className="solves-line">{countText}</div>;

  // Hover open/close is mouse-only: a tap fires synthetic mouse events too,
  // and letting those open the panel would make the tap's click toggle it
  // straight back shut. Touch drives open purely through the click toggle.
  return (
    <div className="solves-line">
      <span
        ref={wrapRef}
        className={`solves-flyout ${open ? "open" : ""}`}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
      >
        <button
          className="solves-trigger"
          aria-expanded={open}
          aria-label={`${countText} — show mutuals' progress`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="solves-avatars" aria-hidden>
            {started.slice(0, 4).map((m) => (
              <span className="solves-avatar" key={m.user_id}>
                <Avatar username={m.username} displayName={m.display_name} size={16} />
              </span>
            ))}
          </span>
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
        </div>
      </span>
    </div>
  );
}
