import { useEffect, useState } from "react";
import {
  estimateOfflineUsage,
  listOfflinePuzzles,
  removePuzzleOffline,
  type CachedPuzzle,
} from "../lib/offlineCache.ts";
import { SOURCES } from "../lib/sources.ts";
import { DeleteIcon } from "./icons.tsx";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function subtitle(p: CachedPuzzle): string {
  return p.kind === "syndicated" ? `${SOURCES[p.source!].label} · ${p.date}` : "Community puzzle";
}

/** Settings section: view and remove puzzles saved for offline play (the
 *  "Save offline" toggle on Archive tiles and in the Solver actionbar),
 *  plus a rough sense of how much storage they're using. This is local-
 *  device state, not account state — lives in the Settings modal rather
 *  than the signed-in-only AccountPage. */
export function OfflinePuzzlesControls({ onChange }: { onChange: () => void }) {
  const [puzzles, setPuzzles] = useState<CachedPuzzle[] | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const refresh = () => {
    listOfflinePuzzles().then(setPuzzles);
    estimateOfflineUsage().then(setUsage);
  };
  useEffect(refresh, []);

  const onRemove = async (key: string) => {
    await removePuzzleOffline(key);
    refresh();
    onChange();
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Offline puzzles</span>
      {puzzles === null ? (
        <span className="savedata-status">Loading…</span>
      ) : puzzles.length === 0 ? (
        <span className="savedata-status">
          None saved yet — tap the download icon on any puzzle to play it offline.
        </span>
      ) : (
        <ul className="offline-puzzle-list">
          {puzzles.map((p) => (
            <li key={p.key} className="offline-puzzle-row">
              <div className="offline-puzzle-text">
                <span className="offline-puzzle-title">{p.puzzle.title}</span>
                <span className="ai-author">{subtitle(p)}</span>
              </div>
              <button
                className="btn icon-btn"
                onClick={() => void onRemove(p.key)}
                aria-label={`Remove "${p.puzzle.title}" from offline puzzles`}
                title="Remove"
              >
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {usage && (
        <span className="savedata-status">
          Using {formatBytes(usage.usage)} of {formatBytes(usage.quota)} available on this device. Saved
          puzzles may be cleared by your browser if unused for a long time.
        </span>
      )}
    </div>
  );
}
