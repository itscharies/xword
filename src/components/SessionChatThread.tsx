import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SessionApi } from "../hooks/useSession.ts";
import type { SessionComment } from "../lib/comments.ts";
import { Avatar } from "./Avatar.tsx";
import { SendIcon } from "./icons.tsx";

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
 *  (SessionChat) and the mobile full-screen sheet (SessionChatOverlay) — only
 *  the surrounding shell differs. Both shells now give .sc-messages its own
 *  overflow, so there is finally one scroll model instead of two. Mounted only
 *  while its shell is showing, so autofocus/autoscroll can just fire on mount
 *  rather than reacting to an `open` flag. */
export function SessionChatThread({
  session,
  userId,
  onEscape,
  autoFocus = true,
}: {
  session: SessionApi;
  userId: string;
  /** Esc in the composer closes whichever shell is showing. */
  onEscape?: () => void;
  /** Focus the composer on mount. On the mobile sheet this is what brings the
   *  keyboard up with the sheet rather than a tap later — see the
   *  useLayoutEffect below for why the timing matters there. */
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Only follow new messages when the reader is already at the bottom — yanking
  // someone out of scrollback because a message arrived is its own kind of jank.
  const pinned = useRef(true);

  // useLayoutEffect, not useEffect, and this is the load-bearing difference on
  // iOS: WebKit only raises the keyboard for a programmatic focus() that is
  // still inside the call stack of the user gesture that caused it. A layout
  // effect runs synchronously in the commit, which for a discrete event like
  // the Toolbar tap is still that same task; a passive effect can be deferred
  // past it, and then the input focuses but no keyboard appears.
  useLayoutEffect(() => {
    // preventScroll: focusing an input is enough to make iOS scroll (and,
    // under 16px, zoom) to "reveal" it even when it's already fully visible.
    // Honoured by WebKit for programmatic focus since iOS 15.5. The sheet
    // absorbs the reveal it would otherwise do via padding-top anyway.
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Was `bottomRef.scrollIntoView({ block: "end" })`, which walks to whichever
  // scrolling ancestor applies — in the old mobile shell .sc-messages had
  // `overflow-y: visible`, so that ancestor was the *document* and this yanked
  // the whole page to its bottom on open and again on every incoming message.
  // Setting scrollTop on the list itself can't touch an ancestor, on either
  // shell. useLayoutEffect, not useEffect: otherwise the first painted frame
  // shows the thread scrolled to the top and it snaps a frame later.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [session.comments.length]);

  // The keyboard opening shortens the list's box (the sheet's padding-bottom
  // grows). Re-pin across that reflow so the newest message stays visible
  // instead of sliding up out of sight.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onListScroll = () => {
    const el = listRef.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const participantFor = (authorId: string) =>
    session.participants.find((p) => p.user_id === authorId);

  const submit = () => {
    if (!draft.trim()) return;
    void session.postComment(draft);
    setDraft("");
  };

  return (
    <>
      <div className="sc-messages" ref={listRef} onScroll={onListScroll}>
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
        {/* preventDefault on mousedown so the button never takes focus: on a
            phone, letting it steal focus from the input dismisses the keyboard
            on every send, and the sheet then resizes twice per message. The
            click still fires. */}
        <button
          type="button"
          className="sc-send"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          disabled={!draft.trim()}
          aria-label="Send message"
          title="Send"
        >
          <SendIcon />
        </button>
      </div>
    </>
  );
}
