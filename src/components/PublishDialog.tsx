import { useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { publishPuzzle, type Visibility } from "../lib/puzzles.ts";
import type { Puzzle } from "../types.ts";

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
}: {
  puzzle: Puzzle;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(puzzle.title || "Untitled puzzle");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || publishing) return;
    setPublishing(true);
    setError(null);
    const { id, error } = await publishPuzzle(
      user.id,
      title.trim(),
      { ...puzzle, title: title.trim() },
      visibility,
    );
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
        <span className="setting-label">Title</span>
        <input
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="setting-row">
        <span className="setting-label">Who can see it</span>
        {VISIBILITY_OPTIONS.map((opt) => (
          <label key={opt.value} className="follow-row" style={{ cursor: "pointer" }}>
            <span>
              <input
                type="radio"
                name="visibility"
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
              />{" "}
              {opt.label}
              <br />
              <span className="savedata-status">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <button className="btn btn-accent" type="submit" disabled={publishing}>
        {publishing ? "Publishing…" : "Publish"}
      </button>
      {error && <span className="savedata-status">{error}</span>}
    </form>
  );
}
