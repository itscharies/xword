import { Avatar } from "./Avatar.tsx";
import type { AccentId } from "../lib/theme.ts";

/** The minimum identity an avatar needs — satisfied structurally by both
 *  MutualProgress rows and session participants. */
export interface AvatarPerson {
  user_id: string;
  username: string;
  display_name: string;
  accent: AccentId;
}

/** A group of people as one depth-stacked cluster: the first avatar leads
 *  at full size, the rest sit smaller and tucked behind it. Shared by the
 *  feed tiles, the solver page's solves trigger and the co-op session bar
 *  so they all read as the same element. Decorative — name the people in
 *  the parent's label. */
export function AvatarStack({ people }: { people: AvatarPerson[] }) {
  return (
    <span className="solves-avatars" aria-hidden>
      {people.slice(0, 3).map((m, i) => (
        <span className="solves-avatar" key={m.user_id} style={{ zIndex: people.length - i }}>
          <Avatar
            username={m.username}
            displayName={m.display_name}
            accent={m.accent}
            size={16 - (i * 4)}
          />
        </span>
      ))}
    </span>
  );
}
