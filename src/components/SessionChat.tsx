import { useEffect, useState } from "react";
import type { SessionApi } from "../hooks/useSession.ts";
import { Avatar } from "./Avatar.tsx";
import { SessionChatThread } from "./SessionChatThread.tsx";

/** Session-wide chat's desktop shell — a lightweight floating panel (not a
 *  Modal; .sc-panel matches every other popover's border/shadow weight),
 *  pinned to the viewport's bottom-left corner. Opened from the Toolbar's
 *  chat button now, not one of its own — this component only renders the
 *  panel itself and, while closed, the transient "new message" popups
 *  (unaffected by any of this — they float near this same corner on every
 *  viewport size, and are the only thing this renders while the chat is
 *  closed). Mobile's expanded view is SessionChatOverlay instead — a
 *  full-screen sheet, because a small floating panel can't stay glued to the
 *  keyboard's edge on a phone. */
export function SessionChat({
  session,
  userId,
  open,
  isMobile,
  onClose,
}: {
  session: SessionApi;
  userId: string;
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
}) {
  // Pinned to the viewport, not the canvas — but on mobile the sticky
  // clue-bar/keyboard lives in that same bottom-left corner, so measure its
  // real height (it's 0 on desktop, where that bar is hidden) and clear it
  // rather than hardcoding an offset that would drift with keyboard rows,
  // safe-area insets, etc.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".mobile-bar");
    if (!bar) return;
    const update = () => setKeyboardHeight(bar.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const participantFor = (authorId: string) =>
    session.participants.find((p) => p.user_id === authorId);

  const popups = session.notices.filter((n) => n.kind === "comment");

  return (
    <div className="session-chat" style={{ bottom: keyboardHeight + 12 }}>
      {!open && popups.length > 0 && (
        <div className="sc-popups">
          {popups.map((n) => {
            const author = participantFor(n.authorId);
            return (
              <div key={n.id} className={`sc-popup ${n.leaving ? "leaving" : ""}`}>
                <Avatar
                  className="sc-avatar"
                  username={author?.username ?? "solver"}
                  displayName={author?.display_name ?? "Someone"}
                  accent={author?.accent ?? "yellow"}
                  size={20}
                />
                <span className="sc-body">{n.body}</span>
              </div>
            );
          })}
        </div>
      )}
      {open && !isMobile && (
        <div className="sc-panel">
          <SessionChatThread session={session} userId={userId} onEscape={onClose} />
        </div>
      )}
    </div>
  );
}
