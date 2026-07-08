import { useEffect, useState } from "react";
import type { PuzzleSource } from "../lib/sources.ts";
import { listMutualProgress, type MutualProgress } from "../lib/puzzles.ts";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { Avatar } from "./Avatar.tsx";
import { CheckIcon } from "./icons.tsx";

/** How each mutual is doing on the open puzzle — a strip of avatar chips
 *  under the solver byline, each with a solved tick or a % filled. Renders
 *  nothing when signed out or when no mutual has opened this puzzle, so it
 *  costs no space on the (common) solo path. */
export function MutualProgressRow({
  communityId,
  source,
  date,
}: {
  /** Set for a published (/p/<id>) puzzle; source/date cover syndicated. */
  communityId?: string;
  source?: PuzzleSource;
  date?: string;
}) {
  const { user } = useAuth();
  const [mutuals, setMutuals] = useState<MutualProgress[]>([]);

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

  // Only mutuals who've actually started count as "progress" — a row whose
  // grid is still empty (opened, typed nothing) would just read as noise.
  const started = mutuals.filter((m) => m.completed || m.filled > 0);
  if (started.length === 0) return null;

  return (
    <div className="mutuals-row" aria-label="Progress from mutuals">
      {started.map((m) => {
        // Same 99% cap as the archive badges: filled isn't solved.
        const pct = m.completed ? 100 : Math.min(99, Math.round((100 * m.filled) / Math.max(1, m.total)));
        const label = m.completed ? `${m.display_name} solved this` : `${m.display_name}: ${pct}% filled`;
        return (
          <span className="mutual-chip" key={m.user_id} title={label} aria-label={label}>
            <Avatar username={m.username} displayName={m.display_name} size={20} />
            <span className="mutual-chip-name">{m.display_name}</span>
            {m.completed ? (
              <span className="mutual-chip-done">
                <CheckIcon />
              </span>
            ) : (
              <span className="mutual-chip-pct">{pct}%</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
