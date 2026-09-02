import type { Story, StoryDefault } from "@ladle/react";
import { SessionChatOverlay } from "./SessionChatOverlay.tsx";
import type { SessionApi } from "../hooks/useSession.ts";
import type { SessionComment } from "../lib/comments.ts";
import { PARTICIPANTS } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Session / Session chat overlay",
} satisfies StoryDefault;

const chatParticipants = PARTICIPANTS.map((p, i) => ({
  ...p,
  accent: (["pink", "cyan", "lime"] as const)[i],
}));

const comment = (id: string, authorId: string, body: string): SessionComment => ({
  id,
  session_id: "session-1",
  author_id: authorId,
  body,
  created_at: "2026-01-01T10:00:00Z",
});

const HISTORY: SessionComment[] = [
  comment("c1", "user-ada", "Is this an anagram of something?"),
  comment("c2", "user-grace", "Yeah — ARENA scrambled."),
  comment("c3", "user-ada", "Nice, thanks!"),
];

const LONG_HISTORY: SessionComment[] = Array.from({ length: 20 }, (_, i) =>
  comment(`c${i}`, i % 2 === 0 ? "user-ada" : "user-grace", `Message number ${i + 1}.`),
);

function makeSession(comments: SessionComment[]): SessionApi {
  return {
    participants: chatParticipants,
    comments,
    notices: [],
    postComment: async () => {},
  } as unknown as SessionApi;
}

/** Stands in for .app — a bounded, scrollable flex column — so .sc-overlay's
 *  `flex: 1 0 auto` has something to grow into and .sc-composer's
 *  `position: sticky; bottom: 0` sticks to *this* box's edge, the same way
 *  it sticks to the real page's edge in place of .mobile-bar. */
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: 400,
      maxWidth: 400,
      border: "1px dashed var(--muted)",
      overflowY: "auto",
    }}
  >
    {children}
  </div>
);

export const Default: Story = () => (
  <>
    <Note>
      Mobile's expanded chat view — replaces .main and .mobile-bar outright
      (App.tsx renders one or the other) rather than layering over them, and
      scrolls with the page instead of in its own bounded region: a real
      &lt;input&gt; inside a nested scroll container (or worse, position:
      fixed) fights the iOS keyboard's own resizing of the visual viewport.
      No close button of its own: closed by tapping the same Toolbar chat
      button again, same as AnagramOverlay.
    </Note>
    <Stage>
      <SessionChatOverlay session={makeSession(HISTORY)} userId="user-ada" />
    </Stage>
  </>
);

export const LongHistory: Story = () => (
  <>
    <Note>
      Enough messages to scroll — the page (this dashed box, standing in for
      it) scrolls past them while the composer stays pinned to its bottom
      edge, same as .mobile-bar always has.
    </Note>
    <Stage>
      <SessionChatOverlay session={makeSession(LONG_HISTORY)} userId="user-ada" />
    </Stage>
  </>
);
