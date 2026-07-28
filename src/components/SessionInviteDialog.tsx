import { useState } from "react";
import { Modal } from "./Modal.tsx";

/** Copy-the-invite-link modal for a co-op session — the same readonly
 *  input + Copy pattern as PublishDialog's published state, so the two
 *  share links read as the same feature. Where the Web Share API exists
 *  (every mobile browser, most desktop ones), a Share button opens the
 *  native share sheet instead of making the sender paste by hand. */
export function SessionInviteDialog({
  url,
  title,
  onClose,
}: {
  url: string;
  /** Puzzle title, for the share sheet's message. */
  title?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const share = async () => {
    try {
      await navigator.share({
        title: "Solve together",
        text: title ? `Solve “${title}” with me` : "Solve a crossword with me",
        url,
      });
    } catch {
      // The sender dismissed the share sheet — not an error.
    }
  };

  return (
    <Modal title="Solve together" onClose={onClose}>
      <div className="setting-row">
        <p>
          Anyone with this link can sign in and join your session — you'll
          solve the same grid together, live.
        </p>
        <div className="savedata-actions">
          <input
            className="text-input"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="btn"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          {canShare && (
            <button className="btn btn-accent" onClick={() => void share()}>
              Share…
            </button>
          )}
        </div>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
