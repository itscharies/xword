import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useProfile } from "../hooks/useProfile.ts";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { avatarUrl } from "../lib/auth.ts";
import {
  follow,
  listFollowers,
  listFollowing,
  searchProfiles,
  unfollow,
  type Profile,
} from "../lib/profile.ts";
import {
  deletePuzzle,
  listMyPuzzles,
  VISIBILITY_LABEL,
  type PublishedPuzzle,
} from "../lib/puzzles.ts";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";
import { UserIcon } from "./icons.tsx";
import { Logo } from "./Logo.tsx";

/** Full "/account" page. Branches on auth + profile state: signed out ->
 *  Google sign-in; signed in with no `profiles` row yet -> claim a
 *  username/display name; otherwise -> account summary + a stack of
 *  home-page-tile-styled sections (My puzzles, Followers, Following). */
export function AccountPage({
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
  const { status, user, signInWithGoogle, signOut } = useAuth();
  const profile = useProfile();
  useDocumentTitle("Account");

  let body: React.ReactNode = null;
  if (status !== "loading") {
    if (!user) {
      body = <SignInPrompt signInWithGoogle={signInWithGoogle} />;
    } else if (profile === "loading") {
      body = null;
    } else if (!profile) {
      body = <ClaimProfileForm userId={user.id} />;
    } else {
      body = (
        <>
          <AccountSummary
            avatar={avatarUrl(user)}
            profile={profile}
            onSignOut={() => void signOut()}
          />
          <PuzzlesSection
            userId={user.id}
            onOpenCreate={onOpenCreate}
            onOpenPuzzle={onOpenPuzzle}
            onOpenDraft={onOpenDraft}
          />
          <FollowersSection userId={user.id} />
          <FollowingSection userId={user.id} />
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
            <h1>Account</h1>
          </div>
        </div>
      </header>

      <div className="account-body">{body}</div>
    </div>
  );
}

function SignInPrompt({
  signInWithGoogle,
}: {
  signInWithGoogle: () => Promise<{ error: string | null }>;
}) {
  const [message, setMessage] = useState<string | null>(null);

  const google = async () => {
    setMessage(null);
    const { error } = await signInWithGoogle();
    if (error) setMessage(error);
    // On success the page navigates away to Google, so there's nothing else to do here.
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Sign in</span>
      <button className="btn" onClick={() => void google()}>
        Continue with Google
      </button>
      {message && <span className="savedata-status">{message}</span>}
    </div>
  );
}

function AccountSummary({
  avatar,
  profile,
  onSignOut,
}: {
  avatar: string | null;
  profile: Profile;
  onSignOut: () => void;
}) {
  return (
    <div className="account-summary">
      {avatar ? (
        <img className="account-avatar" src={avatar} alt="" />
      ) : (
        <span className="account-avatar account-avatar-fallback">
          <UserIcon />
        </span>
      )}
      <div className="account-identity">
        <div className="account-display-name">{profile.display_name}</div>
        <div className="savedata-status">@{profile.username}</div>
      </div>
      <button className="btn" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}

function PuzzlesSection({
  userId,
  onOpenCreate,
  onOpenPuzzle,
  onOpenDraft,
}: {
  userId: string;
  onOpenCreate: () => void;
  onOpenPuzzle: (id: string) => void;
  onOpenDraft: (id: string) => void;
}) {
  const [puzzles, setPuzzles] = useState<PublishedPuzzle[] | null>(null);
  const refresh = () => {
    listMyPuzzles(userId).then(setPuzzles);
  };
  useEffect(refresh, [userId]);

  const onDelete = async (p: PublishedPuzzle) => {
    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    await deletePuzzle(p.id);
    refresh();
  };

  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>My puzzles</h2>
        <button className="btn" onClick={onOpenCreate}>
          + New
        </button>
      </div>
      {puzzles === null ? null : puzzles.length === 0 ? (
        <p className="account-empty">
          You haven't published a puzzle yet — start one with "+ New" above.
        </p>
      ) : (
        <ul className="archive-list">
          {puzzles.map((p) => (
            <li key={p.id} className="archive-item account-tile">
              <button
                className="btn-plain-link"
                onClick={() => (p.visibility === "draft" ? onOpenDraft(p.id) : onOpenPuzzle(p.id))}
              >
                <span className="ai-source">{p.title}</span>
                <span className="ai-author">
                  {VISIBILITY_LABEL[p.visibility]}
                  {p.visibility !== "draft" &&
                    ` · ${p.completions} ${p.completions === 1 ? "solve" : "solves"}`}
                </span>
              </button>
              <button
                className="account-tile-delete"
                onClick={() => void onDelete(p)}
                aria-label={`Delete "${p.title}"`}
                title="Delete"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowersSection({ userId }: { userId: string }) {
  const [followers, setFollowers] = useState<Profile[] | null>(null);
  useEffect(() => {
    listFollowers(userId).then(setFollowers);
  }, [userId]);

  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>Followers{followers && followers.length > 0 ? ` (${followers.length})` : ""}</h2>
      </div>
      {followers === null ? null : followers.length === 0 ? (
        <p className="account-empty">No one's following you yet.</p>
      ) : (
        <ul className="archive-list">
          {followers.map((p) => (
            <li key={p.user_id} className="archive-item account-tile">
              <span className="ai-source">{p.display_name}</span>
              <span className="ai-author">@{p.username}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowingSection({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[] | null>(null);

  const refresh = () => {
    listFollowing(userId).then(setFollowing);
  };
  useEffect(refresh, [userId]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setResults(await searchProfiles(query, userId));
  };

  const followingIds = new Set((following ?? []).map((p) => p.user_id));

  const toggleFollow = async (p: Profile) => {
    if (followingIds.has(p.user_id)) await unfollow(userId, p.user_id);
    else await follow(userId, p.user_id);
    refresh();
  };

  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>Following{following && following.length > 0 ? ` (${following.length})` : ""}</h2>
      </div>

      <form className="savedata-actions" onSubmit={search}>
        <input
          className="text-input"
          placeholder="Find someone by username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {results.length > 0 && (
        <ul className="archive-list">
          {results.map((p) => (
            <li key={p.user_id} className="archive-item account-tile">
              <span className="ai-source">{p.display_name}</span>
              <span className="ai-author">@{p.username}</span>
              <button className="btn account-tile-action" onClick={() => void toggleFollow(p)}>
                {followingIds.has(p.user_id) ? "Unfollow" : "Follow"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {following === null ? null : following.length === 0 ? (
        <p className="account-empty">
          You're not following anyone yet — search a username above to find friends.
        </p>
      ) : (
        <ul className="archive-list">
          {following.map((p) => (
            <li key={p.user_id} className="archive-item account-tile">
              <span className="ai-source">{p.display_name}</span>
              <span className="ai-author">@{p.username}</span>
              <button className="btn account-tile-action" onClick={() => void toggleFollow(p)}>
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
