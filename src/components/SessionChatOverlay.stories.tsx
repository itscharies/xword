import { useState } from "react";
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

const LONG_HISTORY: SessionComment[] = Array.from({ length: 30 }, (_, i) =>
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

/** A phone-sized stage. The transform is load-bearing, not decoration: a
 *  transformed element becomes the containing block for a position: fixed
 *  descendant, so passing this as `portalTo` scopes the sheet to the frame
 *  instead of letting it cover all of Ladle. It also skips the page scroll
 *  lock, which would otherwise freeze the story browser itself. */
function SheetDemo({ comments }: { comments: SessionComment[] }) {
  const [open, setOpen] = useState(true);
  // State, not a ref: the sheet portals *into* this node, so the render that
  // mounts it has to be the one after the node exists.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setStage}
      style={{
        position: "relative",
        transform: "translateZ(0)",
        width: 375,
        height: 640,
        maxWidth: "100%",
        border: "1px dashed var(--muted)",
        overflow: "hidden",
      }}
    >
      {!open && (
        <button
          className="btn btn-accent"
          style={{ margin: 12 }}
          onClick={() => setOpen(true)}
        >
          Open the chat sheet
        </button>
      )}
      {open && stage && (
        <SessionChatOverlay
          session={makeSession(comments)}
          userId="user-ada"
          onClose={() => setOpen(false)}
          portalTo={stage}
        />
      )}
    </div>
  );
}

export const Default: Story = () => (
  <>
    <Note>
      Mobile's chat view: a full-screen sheet laid over the solver, which stays
      mounted underneath — so opening and closing it can't change the document's
      height, and the page keeps its scroll position. Its box is sized from
      window.visualViewport rather than any CSS viewport unit, which is what
      keeps the composer on the keyboard's edge (see useVisualViewport). Best
      viewed at a phone width.
    </Note>
    <SheetDemo comments={HISTORY} />
  </>
);

export const LongHistory: Story = () => (
  <>
    <Note>
      Enough messages to scroll. The list is its own scroll container and opens
      pinned to the newest message — deliberately not scrollIntoView, which
      would reach past the sheet and scroll the page behind it.
    </Note>
    <SheetDemo comments={LONG_HISTORY} />
  </>
);
