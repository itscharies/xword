import type { SessionApi } from "../hooks/useSession.ts";
import { useFlyout } from "../hooks/useFlyout.ts";
import { Avatar } from "./Avatar.tsx";
import { AvatarStack } from "./AvatarStack.tsx";
import { UserPlusIcon } from "./icons.tsx";

/** The co-op session's roster segment — lives in the title-block slot the
 *  SolvesFlyout occupies for solo puzzles, and reuses its trigger/panel
 *  pattern: stacked avatars + a summary line, with a hover-or-tap flyout
 *  listing each participant (green dot = a live tab right now) and an
 *  Invite row. */
export function SessionBar({
  session,
  userId,
  onInvite,
}: {
  session: SessionApi;
  userId: string | null;
  onInvite: () => void;
}) {
  const { open, setOpen, wrapRef, hoverProps } = useFlyout<HTMLSpanElement>();

  const others = session.participants.filter((p) => p.user_id !== userId);
  const countText =
    session.ended
      ? "Session ended"
      : others.length === 0
        ? "Waiting for others to join…"
        : others.length === 1
          ? `Solving with ${others[0].display_name}`
          : `Solving with ${others.length} others`;

  return (
    <div className="solves-line">
      <span
        ref={wrapRef}
        className={`solves-flyout ${open ? "open" : ""}`}
        {...hoverProps}
      >
        <button
          className="solves-trigger"
          aria-expanded={open}
          aria-label={`${countText} — show session participants`}
          onClick={() => setOpen((v) => !v)}
        >
          <AvatarStack people={session.participants.slice(0, 4)} />
          {countText}
        </button>
        <div className="solves-panel" role="tooltip">
          {session.participants.map((p) => (
            <div className="solves-row" key={p.user_id}>
              <Avatar username={p.username} displayName={p.display_name} accent={p.accent} size={20} />
              <span className="solves-row-name">
                {p.display_name}
                {p.user_id === userId ? " (you)" : ""}
              </span>
              <span
                className={`session-dot ${session.online.has(p.user_id) ? "on" : ""}`}
                title={session.online.has(p.user_id) ? "Online" : "Offline"}
                aria-label={session.online.has(p.user_id) ? "Online" : "Offline"}
              />
            </div>
          ))}
          {!session.ended && (
            <button className="solves-row session-invite-row" onClick={onInvite}>
              <span className="session-invite-icon">
                <UserPlusIcon />
              </span>
              <span className="solves-row-name">Invite someone…</span>
            </button>
          )}
        </div>
      </span>
    </div>
  );
}
