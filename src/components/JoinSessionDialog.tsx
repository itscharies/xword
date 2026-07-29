import { useState } from "react";
import { Modal } from "./Modal.tsx";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The session id inside pasted invite text — a full /s/<uuid> link, a bare
 *  uuid, or a link with surrounding message text all work. */
function parseSessionLink(text: string): string | null {
  const viaPath = text.match(/\/s\/([0-9a-f-]{36})/i)?.[1] ?? text.match(UUID_RE)?.[0];
  return viaPath && UUID_RE.test(viaPath) ? viaPath.toLowerCase() : null;
}

/** Paste-an-invite-link entry point, for the case where a link can't reach
 *  the app by being tapped: iOS opens links from other apps in Safari, never
 *  in an installed home-screen web app — so a PWA user's way into a friend's
 *  session is copy the link in Messages, open the app, paste it here. */
export function JoinSessionDialog({
  onJoin,
  onClose,
}: {
  onJoin: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  const join = (raw: string) => {
    const id = parseSessionLink(raw);
    if (id) onJoin(id);
    else setError(true);
  };

  // One-tap flow where the browser lets us read the clipboard (iOS shows
  // its little paste-permission bubble); the input stays as the fallback.
  const canReadClipboard =
    typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
  const pasteAndJoin = async () => {
    try {
      join(await navigator.clipboard.readText());
    } catch {
      // Permission declined — the input below still works.
    }
  };

  return (
    <Modal title="Join a session" onClose={onClose}>
      <div className="setting-row">
        <p>
          Got an invite link from a friend? Paste it here to join their
          session.
        </p>
        <form
          className="savedata-actions"
          onSubmit={(e) => {
            e.preventDefault();
            join(text);
          }}
        >
          <input
            className="text-input"
            placeholder="https://…/s/…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(false);
            }}
            autoFocus
          />
          <button className="btn btn-accent" type="submit">
            Join
          </button>
        </form>
        {canReadClipboard && (
          <button className="btn" onClick={() => void pasteAndJoin()}>
            Paste from clipboard
          </button>
        )}
        {error && (
          <span className="savedata-status">
            That doesn't look like an invite link.
          </span>
        )}
      </div>
    </Modal>
  );
}
