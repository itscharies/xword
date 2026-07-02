import { useRef, useState } from "react";
import { exportSaveData, importSaveData } from "../lib/saveData.ts";
import { DownloadIcon, UploadIcon } from "./icons.tsx";

/** Settings row: back up / restore all localStorage save data (progress,
 *  theme, filters, builder draft) to and from a JSON file. */
export function SaveDataControls() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    if (
      !window.confirm(
        "Import save data? This overwrites progress and settings for any puzzles in the file.",
      )
    )
      return;
    try {
      const n = await importSaveData(file);
      setStatus(`Imported ${n} item${n === 1 ? "" : "s"}. Reloading…`);
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    }
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Save data</span>
      <div className="savedata-actions">
        <button className="btn" onClick={exportSaveData}>
          <DownloadIcon /> Export
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <UploadIcon /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onFile}
        />
      </div>
      {status && <span className="savedata-status">{status}</span>}
    </div>
  );
}
