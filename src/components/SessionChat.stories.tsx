import type { Story, StoryDefault } from "@ladle/react";
import { SessionChat } from "./SessionChat.tsx";
import type { SessionApi, SessionNotice } from "../hooks/useSession.ts";
import type { SessionComment } from "../lib/comments.ts";
import { PARTICIPANTS } from "../stories/fixtures.ts";
import { Note } from "../stories/helpers.tsx";

export default {
  title: "Session / Session chat",
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

function makeSession(
  comments: SessionComment[],
  notices: SessionNotice[] = [],
  overrides: Partial<SessionApi> = {},
) {
  return {
    participants: chatParticipants,
    comments,
    notices,
    postComment: async () => {},
    ...overrides,
  } as unknown as SessionApi;
}

/** A relative-positioned box the same size as the viewport a real session
 *  would float over — .session-chat is position:fixed, so it anchors to
 *  this story's own viewport corner rather than the page. */
const Stage = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "relative", height: 420, maxWidth: 700, border: "1px dashed var(--muted)" }}>
    {children}
  </div>
);

export const ClosedWithPopup: Story = () => (
  <>
    <Note>
      Closed: the toggle button itself now lives in the Toolbar, so this
      shows just the transient "new message" popup — it floats near this
      same corner on every viewport size and slides back off after a few
      seconds, unaffected by where the button lives.
    </Note>
    <Stage>
      <SessionChat
        session={makeSession(HISTORY, [
          { id: 1, kind: "comment", authorId: "user-grace", body: "Yeah — ARENA scrambled." },
        ])}
        userId="user-ada"
        open={false}
        isMobile={false}
        onClose={() => {}}
      />
    </Stage>
  </>
);

export const DesktopOpen: Story = () => (
  <>
    <Note>
      Open on desktop: the whole scrollable history, oldest to newest, each
      with the sender's real avatar — append-only, no delete. Mobile's
      expanded view is SessionChatOverlay instead (see its own stories).
    </Note>
    <Stage>
      <SessionChat
        session={makeSession(HISTORY)}
        userId="user-ada"
        open={true}
        isMobile={false}
        onClose={() => {}}
      />
    </Stage>
  </>
);

export const Empty: Story = () => (
  <>
    <Note>No messages yet.</Note>
    <Stage>
      <SessionChat
        session={makeSession([])}
        userId="user-ada"
        open={true}
        isMobile={false}
        onClose={() => {}}
      />
    </Stage>
  </>
);
