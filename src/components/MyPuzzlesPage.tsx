import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { deletePuzzle, listMyPuzzles, type PublishedPuzzle } from "../lib/puzzles.ts";
import { Logo } from "./Logo.tsx";

export const VISIBILITY_LABEL: Record<PublishedPuzzle["visibility"], string> = {
  public: "Public to followers",
  mutual: "Mutuals only",
  unlisted: "Unlisted",
  draft: "Draft",
};

/** "/mine" — puzzles the signed-in user has published or saved as a draft,
 *  with the entry point into the Builder to make a new one (replaces the
 *  old header "+" button, which had no natural home once puzzles needed a
 *  page of their own). */
export function MyPuzzlesPage({
  onOpenArchive,
  onOpenCreate,
  onOpenPuzzle,
  onOpenDraft,
}: {
  onOpenArchive: () => void;
  onOpenCreate: () => void;
  onOpenPuzzle: (id: string) => void;
  onOpenDraft: (id: string) => void;
}) {
  const { status, user } = useAuth();
  const [puzzles, setPuzzles] = useState<PublishedPuzzle[]>([]);
  useDocumentTitle("My puzzles");

  const refresh = () => {
    if (user) listMyPuzzles(user.id).then(setPuzzles);
  };
  useEffect(refresh, [user]);

  const onDelete = async (p: PublishedPuzzle) => {
    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    await deletePuzzle(p.id);
    refresh();
  };

  let body: React.ReactNode = null;
  if (status !== "loading") {
    if (!user) {
      body = <p>Sign in from the Account page to see your published puzzles.</p>;
    } else {
      body = (
        <>
          <button className="btn btn-accent" onClick={onOpenCreate}>
            + Create a new puzzle
          </button>
          {puzzles.length === 0 ? (
            <p>You haven't published a puzzle yet.</p>
          ) : (
            <ul className="follow-list">
              {puzzles.map((p) => (
                <li key={p.id} className="follow-row">
                  <button
                    className="btn-plain-link"
                    onClick={() => (p.visibility === "draft" ? onOpenDraft(p.id) : onOpenPuzzle(p.id))}
                  >
                    <span className="account-display-name">{p.title}</span>{" "}
                    <span className="savedata-status">
                      {VISIBILITY_LABEL[p.visibility]}
                      {p.visibility !== "draft" &&
                        ` · ${p.completions} ${p.completions === 1 ? "solve" : "solves"}`}
                    </span>
                  </button>
                  <button className="btn" onClick={() => void onDelete(p)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
  }

  return (
    <div className="app account-page">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>My puzzles</h1>
          </div>
        </div>
      </header>

      <div className="account-body">{body}</div>
    </div>
  );
}
