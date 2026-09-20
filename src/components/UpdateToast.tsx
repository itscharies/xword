import { useEffect, useState } from "react";
import { isUpdateAvailable, onUpdateAvailable, reloadForUpdate } from "../lib/swUpdate.ts";

/** Small non-blocking banner shown once a new service-worker version has
 *  installed and is waiting to take over (see lib/swUpdate.ts) — never
 *  automatic, just an offer to reload. */
export function UpdateToast() {
  const [show, setShow] = useState(isUpdateAvailable);
  useEffect(() => onUpdateAvailable(() => setShow(true)), []);
  if (!show) return null;
  return (
    <div className="update-toast" role="status">
      <span>A new version is available.</span>
      <button className="btn" onClick={reloadForUpdate}>
        Reload
      </button>
    </div>
  );
}
