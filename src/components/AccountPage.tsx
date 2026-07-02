import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useProfile } from "../hooks/useProfile.ts";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import { avatarUrl } from "../lib/auth.ts";
import {
  follow,
  listFollowing,
  searchProfiles,
  unfollow,
  type Profile,
} from "../lib/profile.ts";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";
import { UserIcon } from "./icons.tsx";
import { Logo } from "./Logo.tsx";

/** Full "/account" page. Branches on auth + profile state: signed out ->
 *  Google sign-in; signed in with no `profiles` row yet -> claim a
 *  username/display name; otherwise -> account summary + follow search. */
export function AccountPage({
  onOpenArchive,
  onOpenMine,
}: {
  onOpenArchive: () => void;
  onOpenMine: () => void;
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
            onOpenMine={onOpenMine}
          />
          <FollowPanel userId={user.id} />
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
  onOpenMine,
}: {
  avatar: string | null;
  profile: Profile;
  onSignOut: () => void;
  onOpenMine: () => void;
}) {
  return (
    <div className="setting-row">
      <span className="setting-label">Account</span>
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
        <button className="btn" onClick={onOpenMine}>
          My puzzles
        </button>
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function FollowPanel({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<Profile[]>([]);

  const refreshFollowing = () => {
    listFollowing(userId).then(setFollowing);
  };
  useEffect(refreshFollowing, [userId]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setResults(await searchProfiles(query, userId));
  };

  const followingIds = new Set(following.map((p) => p.user_id));

  const toggleFollow = async (p: Profile) => {
    if (followingIds.has(p.user_id)) await unfollow(userId, p.user_id);
    else await follow(userId, p.user_id);
    refreshFollowing();
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Find people</span>
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

      {following.length > 0 && (
        <>
          <span className="setting-label">Following</span>
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
        </>
      )}
    </div>
  );
}
