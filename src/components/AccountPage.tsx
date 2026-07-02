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
import { listMyPuzzles, type PublishedPuzzle } from "../lib/puzzles.ts";
import { VISIBILITY_LABEL } from "./MyPuzzlesPage.tsx";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";
import { UserIcon } from "./icons.tsx";
import { Logo } from "./Logo.tsx";

/** Full "/account" page. Branches on auth + profile state: signed out ->
 *  Google sign-in; signed in with no `profiles` row yet -> claim a
 *  username/display name; otherwise -> account summary + a "My puzzles" /
 *  "Followers & following" column pair. */
export function AccountPage({
  onOpenArchive,
  onOpenMine,
  onOpenCreate,
  onOpenPuzzle,
  onOpenDraft,
}: {
  onOpenArchive: () => void;
  onOpenMine: () => void;
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
          <div className="account-columns">
            <PuzzlesPanel
              userId={user.id}
              onOpenMine={onOpenMine}
              onOpenCreate={onOpenCreate}
              onOpenPuzzle={onOpenPuzzle}
              onOpenDraft={onOpenDraft}
            />
            <FollowPanel userId={user.id} />
          </div>
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

const PUZZLES_PREVIEW = 5;

function PuzzlesPanel({
  userId,
  onOpenMine,
  onOpenCreate,
  onOpenPuzzle,
  onOpenDraft,
}: {
  userId: string;
  onOpenMine: () => void;
  onOpenCreate: () => void;
  onOpenPuzzle: (id: string) => void;
  onOpenDraft: (id: string) => void;
}) {
  const [puzzles, setPuzzles] = useState<PublishedPuzzle[] | null>(null);
  useEffect(() => {
    listMyPuzzles(userId).then(setPuzzles);
  }, [userId]);

  return (
    <section className="account-column">
      <div className="account-column-head">
        <span className="setting-label">My puzzles</span>
        <button className="btn" onClick={onOpenCreate}>
          + New
        </button>
      </div>
      {puzzles === null ? null : puzzles.length === 0 ? (
        <p className="account-empty">
          You haven't published a puzzle yet — start one with "+ New" above.
        </p>
      ) : (
        <>
          <ul className="follow-list">
            {puzzles.slice(0, PUZZLES_PREVIEW).map((p) => (
              <li key={p.id} className="follow-row">
                <button
                  className="btn-plain-link"
                  onClick={() =>
                    p.visibility === "draft" ? onOpenDraft(p.id) : onOpenPuzzle(p.id)
                  }
                >
                  <span className="account-display-name">{p.title}</span>{" "}
                  <span className="savedata-status">
                    {VISIBILITY_LABEL[p.visibility]}
                    {p.visibility !== "draft" &&
                      ` · ${p.completions} ${p.completions === 1 ? "solve" : "solves"}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn-plain-link account-see-all" onClick={onOpenMine}>
            {puzzles.length > PUZZLES_PREVIEW
              ? `See all ${puzzles.length} →`
              : "Manage my puzzles →"}
          </button>
        </>
      )}
    </section>
  );
}

function FollowPanel({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[] | null>(null);
  const [followers, setFollowers] = useState<Profile[] | null>(null);

  const refresh = () => {
    listFollowing(userId).then(setFollowing);
    listFollowers(userId).then(setFollowers);
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
    <section className="account-column">
      <span className="setting-label">Followers</span>
      {followers === null ? null : followers.length === 0 ? (
        <p className="account-empty">No one's following you yet.</p>
      ) : (
        <ul className="follow-list">
          {followers.map((p) => (
            <li key={p.user_id} className="follow-row">
              <span>
                {p.display_name} <span className="savedata-status">@{p.username}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <span className="setting-label">Following</span>
      <form className="savedata-actions" onSubmit={search}>
        <input
          className="text-input"
          placeholder="username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
      </form>
      {results.length > 0 && (
        <ul className="follow-list">
          {results.map((p) => (
            <li key={p.user_id} className="follow-row">
              <span>
                {p.display_name} <span className="savedata-status">@{p.username}</span>
              </span>
              <button className="btn" onClick={() => void toggleFollow(p)}>
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
        <ul className="follow-list">
          {following.map((p) => (
            <li key={p.user_id} className="follow-row">
              <span>
                {p.display_name} <span className="savedata-status">@{p.username}</span>
              </span>
              <button className="btn" onClick={() => void toggleFollow(p)}>
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
