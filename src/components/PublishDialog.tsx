import { useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { publishPuzzle, updatePuzzle, type Visibility } from "../lib/puzzles.ts";
import type { Puzzle } from "../types.ts";
import { CheckIcon } from "./icons.tsx";

const BASE = import.meta.env.BASE_URL;

const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public to followers", hint: "Anyone who follows you can see and solve it." },
  { value: "mutual", label: "Mutuals only", hint: "Only people you follow and who follow you back." },
  { value: "unlisted", label: "Unlisted", hint: "Only visible to someone with the direct link." },
];

/** Body of the "Publish puzzle" modal — title + visibility, then the
 *  shareable link once it's live. */
export function PublishDialog({
  puzzle,
  onClose,
  existingId,
}: {
  puzzle: Puzzle;
  onClose: () => void;
  /** Set when publishing a puzzle already saved as a draft — updates that
   *  row in place instead of inserting a duplicate. */
  existingId?: string | null;
}) {
  const { user } = useAuth();
  const title = puzzle.title.trim() || "Untitled puzzle";
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || publishing) return;
    setPublishing(true);
    setError(null);
    const finalPuzzle = { ...puzzle, title };
    const { id, error } = existingId
      ? await updatePuzzle(existingId, title, finalPuzzle, visibility).then((r) => ({
          id: existingId,
          error: r.error,
        }))
      : await publishPuzzle(user.id, title, finalPuzzle, visibility);
    setPublishing(false);
    if (error) setError(error);
    else setPublishedId(id);
  };

  if (publishedId) {
    const url = `${window.location.origin}${BASE}p/${publishedId}`;
    return (
      <div className="setting-row">
        <p>Published! Share this link:</p>
        <div className="savedata-actions">
          <input className="text-input" readOnly value={url} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(url)}>
            Copy
          </button>
        </div>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form className="settings" onSubmit={submit} style={{ gap: 14 }}>
      <div className="setting-row">
        <span className="setting-label">Who can see it</span>
        <div role="radiogroup" aria-label="Who can see it" className="visibility-options">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={visibility === opt.value}
              className="check-row"
              onClick={() => setVisibility(opt.value)}
            >
              <span className={`checkbox ${visibility === opt.value ? "on" : ""}`}>
                {visibility === opt.value && <CheckIcon />}
              </span>
              <span>
                {opt.label}
                <br />
                <span className="savedata-status">{opt.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-accent" type="submit" disabled={publishing}>
        {publishing ? "Publishing…" : "Publish"}
      </button>
      {error && <span className="savedata-status">{error}</span>}
    </form>
  );
}
