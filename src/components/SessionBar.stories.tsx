import type { Story, StoryDefault } from "@ladle/react";
import { SessionBar } from "./SessionBar.tsx";
import type { SessionApi } from "../hooks/useSession.ts";
import { PARTICIPANTS } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Session / Session bar",
} satisfies StoryDefault;

/** SessionBar only reads participants/online/ended — a data literal stands
 *  in for the full session hook. */
const session = (over: { online?: string[]; ended?: boolean; solo?: boolean } = {}) =>
  ({
    participants: over.solo ? PARTICIPANTS.slice(0, 1) : PARTICIPANTS,
    online: new Set(over.online ?? []),
    ended: over.ended ?? false,
  }) as unknown as SessionApi;

const Shell = ({ children }: { children: React.ReactNode }) => (
  // The flyout panel opens downward, absolutely positioned — leave headroom.
  <div style={{ minHeight: 320 }}>{children}</div>
);

export const Active: Story = () => (
  <Shell>
    <Note>
      Hover or tap to open the roster — green dots are participants with a
      live tab. Viewed as Ada, so she's filtered from "solving with".
    </Note>
    <SessionBar
      session={session({ online: ["user-ada", "user-grace"] })}
      userId="user-ada"
      onInvite={() => {}}
    />
  </Shell>
);

export const WaitingForOthers: Story = () => (
  <Shell>
    <SessionBar session={session({ solo: true })} userId="user-ada" onInvite={() => {}} />
  </Shell>
);

export const Ended: Story = () => (
  <Shell>
    <SessionBar session={session({ ended: true })} userId="user-ada" onInvite={() => {}} />
  </Shell>
);
