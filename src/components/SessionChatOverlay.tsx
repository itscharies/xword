import type { SessionApi } from "../hooks/useSession.ts";
import { SessionChatThread } from "./SessionChatThread.tsx";

/** Session chat's mobile shell — rendered by App.tsx in place of both .main
 *  and .mobile-bar while open (not layered over them): the on-screen
 *  keyboard is irrelevant to a real chat <input>, and there's no board
 *  underneath worth keeping visible either. Scrolls with the page itself
 *  rather than in its own bounded region, same as .main normally does — a
 *  real <input> inside a nested scroll container (or worse, position:
 *  fixed) fights the iOS keyboard's own resizing of the visual viewport, so
 *  the composer needs to live in ordinary flow instead. No close button of
 *  its own, same as AnagramOverlay: closed by tapping the same Toolbar chat
 *  button again. */
export function SessionChatOverlay({
  session,
  userId,
}: {
  session: SessionApi;
  userId: string;
}) {
  return (
    <div className="sc-overlay" role="dialog" aria-label="Session chat">
      <SessionChatThread session={session} userId={userId} autoFocus={false} pinComposer />
    </div>
  );
}
