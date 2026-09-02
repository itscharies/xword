import { useEffect, useRef, useState } from "react";
import type { SessionApi } from "../hooks/useSession.ts";
import type { SessionComment } from "../lib/comments.ts";
import { Avatar } from "./Avatar.tsx";

/** Consecutive messages from the same sender collapse into one block (one
 *  avatar/name), the way chat apps do — a new block starts only when the
 *  author actually changes, not on every message. */
function groupConsecutive(comments: SessionComment[]): SessionComment[][] {
  const groups: SessionComment[][] = [];
  for (const m of comments) {
    const last = groups[groups.length - 1];
    if (last && last[0].author_id === m.author_id) {
      last.push(m);
    } else {
      groups.push([m]);
    }
  }
  return groups;
}

/** The message list + composer shared by the desktop floating panel
 *  (SessionChat) and the mobile full-bleed overlay (SessionChatOverlay) —
 *  only the surrounding shell differs between the two. Always mounted only
 *  while its shell is actually showing, so autofocus/autoscroll can just
 *  fire on mount rather than reacting to an `open` flag. */
export function SessionChatThread({
  session,
  userId,
  onEscape,
}: {
  session: SessionApi;
  userId: string;
  /** Esc in the composer closes whichever shell is showing. */
  onEscape?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // A sentinel scrolled into view rather than a hardcoded `scrollTop` — the
  // desktop panel scrolls internally (.sc-messages has its own overflow),
  // while the mobile overlay scrolls with the page itself, and
  // `scrollIntoView` finds whichever scrolling ancestor actually applies
  // instead of the two shells needing different scroll logic.
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [session.comments.length]);

  const participantFor = (authorId: string) =>
    session.participants.find((p) => p.user_id === authorId);

  const submit = () => {
    if (!draft.trim()) return;
    void session.postComment(draft);
    setDraft("");
  };

  return (
    <>
      <div className="sc-messages">
        {session.comments.length === 0 ? (
          <p className="sc-empty">No messages yet — say hello.</p>
        ) : (
          groupConsecutive(session.comments).map((group) => {
            const [first] = group;
            const author = participantFor(first.author_id);
            return (
              <div key={first.id} className="sc-row">
                <Avatar
                  className="sc-avatar"
                  username={author?.username ?? "solver"}
                  displayName={author?.display_name ?? "Someone"}
                  accent={author?.accent ?? "yellow"}
                  size={20}
                />
                <div className="sc-body-wrap">
                  <span className="sc-name">
                    {first.author_id === userId ? "You" : author?.display_name ?? "Someone"}
                  </span>
                  {group.map((m) => (
                    <span key={m.id} className="sc-body">
                      {m.body}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="sc-composer">
        <input
          ref={inputRef}
          className="text-input sc-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onEscape?.();
          }}
          placeholder="Message…"
          maxLength={500}
        />
      </div>
    </>
  );
}
