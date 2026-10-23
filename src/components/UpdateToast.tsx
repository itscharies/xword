import { useEffect, useState } from "react";
import { isUpdateAvailable, onUpdateAvailable, reloadForUpdate } from "../lib/swUpdate.ts";

/** Small non-blocking banner shown once a new service-worker version has
 *  installed and is waiting to take over (see lib/swUpdate.ts) — never
 *  automatic, just an offer to reload. The button goes busy while the new
 *  worker activates: on iOS that can take several seconds, and a button that
 *  seemed to do nothing invited a second tap. */
export function UpdateToast() {
  const [show, setShow] = useState(isUpdateAvailable);
  const [busy, setBusy] = useState(false);
  useEffect(() => onUpdateAvailable(() => setShow(true)), []);
  if (!show) return null;
  return (
    <div className="update-toast" role="status">
      <span>A new version is ready.</span>
      <button
        className="btn"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void reloadForUpdate();
        }}
      >
        {busy ? "Updating…" : "Reload"}
      </button>
    </div>
  );
}
