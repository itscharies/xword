import { useEffect, useState } from "react";
import {
  checkForUpdateNow,
  clearSwLog,
  describeRegistration,
  getShellVersions,
  hasController,
  onSwLog,
  readSwLog,
  type SwLogEntry,
} from "../lib/swUpdate.ts";

function fmt(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Settings row: which app build this device holds and a trace of the
 *  service-worker update handshake (lib/swUpdate.ts), so a "new version"
 *  toast that keeps coming back can be diagnosed on the phone it happens on
 *  rather than guessed at from a laptop. */
export function UpdateLog() {
  const [versions, setVersions] = useState<string[]>([]);
  const [entries, setEntries] = useState<SwLogEntry[]>(readSwLog);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void getShellVersions().then(setVersions);
    return onSwLog(() => {
      setEntries(readSwLog());
      void getShellVersions().then(setVersions);
    });
  }, []);

  const check = async () => {
    setStatus("Checking…");
    const state = await checkForUpdateNow();
    setVersions(await getShellVersions());
    setStatus(`Workers: ${state}`);
  };

  const copy = async () => {
    const text = [
      `shells: ${versions.join(", ") || "none"}`,
      `workers: ${describeRegistration()} controller=${hasController()}`,
      ...entries.map((e) => `${fmt(e.t)} ${e.msg}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.");
    } catch {
      setStatus("Couldn't copy.");
    }
  };

  const version = versions.length === 0 ? "not cached yet" : versions.join(" + ");

  return (
    <div className="setting-row">
      <span className="setting-label">App version</span>
      <span className="savedata-status">
        {version}
        {versions.length > 1 && " (update waiting)"}
      </span>
      <div className="savedata-actions">
        <button className="btn" onClick={check}>
          Check for updates
        </button>
        <button className="btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide log" : "Update log"}
        </button>
      </div>
      {status && <span className="savedata-status">{status}</span>}
      {open && (
        <>
          <ol className="sw-log">
            {entries.length === 0 && <li>No entries yet.</li>}
            {entries
              .slice()
              .reverse()
              .map((e, i) => (
                <li key={`${e.t}-${i}`}>
                  <span className="sw-log-time">{fmt(e.t)}</span> {e.msg}
                </li>
              ))}
          </ol>
          <div className="savedata-actions">
            <button className="btn" onClick={copy}>
              Copy
            </button>
            <button className="btn" onClick={clearSwLog}>
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}
