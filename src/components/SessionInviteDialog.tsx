import { useState } from "react";
import { Modal } from "./Modal.tsx";

/** Copy-the-invite-link modal for a co-op session — the same readonly
 *  input + Copy pattern as PublishDialog's published state, so the two
 *  share links read as the same feature. */
export function SessionInviteDialog({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

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
        </div>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
