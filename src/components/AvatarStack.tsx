import type { MutualProgress } from "../lib/puzzles.ts";
import { Avatar } from "./Avatar.tsx";

/** A group of mutuals as one depth-stacked cluster: the first avatar leads
 *  at full size, the rest sit smaller and tucked behind it. Shared by the
 *  feed tiles and the solver page's solves trigger so the two read as the
 *  same element. Decorative — name the people in the parent's label. */
export function AvatarStack({ people }: { people: MutualProgress[] }) {
  return (
    <span className="solves-avatars" aria-hidden>
      {people.slice(0, 3).map((m, i) => (
        <span className="solves-avatar" key={m.user_id} style={{ zIndex: people.length - i }}>
          <Avatar username={m.username} displayName={m.display_name} size={16 - (i * 4)} />
        </span>
      ))}
    </span>
  );
}
