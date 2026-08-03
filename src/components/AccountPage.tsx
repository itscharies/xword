import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import { useProfile } from "../hooks/useProfile.ts";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import {
  follow,
  listFollowers,
  listFollowing,
  searchProfiles,
  setProfileAccent,
  unfollow,
  type Profile,
} from "../lib/profile.ts";
import { ACCENTS, setAccent, type AccentId } from "../lib/theme.ts";
import {
  deletePuzzle,
  listMyPuzzles,
  VISIBILITY_LABEL,
  type PublishedPuzzle,
} from "../lib/puzzles.ts";
import { ClaimProfileForm } from "./ClaimProfileForm.tsx";
import { CheckIcon, DeleteIcon, EditIcon, UserMinusIcon, UserPlusIcon } from "./icons.tsx";
import { Logo } from "./Logo.tsx";
import { Avatar } from "./Avatar.tsx";
import { Card } from "./Card.tsx";
import { Modal } from "./Modal.tsx";
import { AccountPageSkeleton, TileListSkeleton } from "./Skeleton.tsx";

/** Full "/account" page. Branches on auth + profile state: signed out ->
 *  Google sign-in; signed in with no `profiles` row yet -> claim a
 *  username/display name; otherwise -> account summary + a stack of
 *  home-page-tile-styled sections (My puzzles, Followers, Following). */
export function AccountPage({
  onOpenArchive,
  onOpenCreate,
  onOpenDraft,
}: {
  onOpenArchive: () => void;
  onOpenCreate: () => void;
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
      body = <AccountPageSkeleton />;
    } else if (!profile) {
      body = <ClaimProfileForm userId={user.id} />;
    } else {
      body = (
        <>
          <AccountSummary profile={profile} onSignOut={() => void signOut()} />
          <PuzzlesSection
            userId={user.id}
            onOpenCreate={onOpenCreate}
            onOpenDraft={onOpenDraft}
          />
          <SocialSections userId={user.id} />
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
  profile,
  onSignOut,
}: {
  profile: Profile;
  onSignOut: () => void;
}) {
  const [accent, setAccentState] = useState<AccentId>(profile.accent);

  const pick = (id: AccentId) => {
    setAccentState(id);
    // The theme accent mirrors the profile accent while signed in — repaint
    // right away rather than waiting for a profile refetch, and keep the
    // local pre-paint cache in step so the next load starts on this colour.
    setAccent(id);
    void setProfileAccent(profile.user_id, id);
  };

  return (
    <>
      <div className="account-summary">
        <Avatar
          username={profile.username}
          displayName={profile.display_name}
          accent={accent}
          size={48}
        />
        <div className="account-identity">
          <div className="account-display-name">{profile.display_name}</div>
          <div className="savedata-status">@{profile.username}</div>
        </div>
        <button className="btn" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="setting-row">
        <span className="setting-label">Theme colour</span>
        <div className="swatches" role="radiogroup" aria-label="Theme colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              className={`swatch ${accent === a.id ? "active" : ""}`}
              style={{ background: a.swatch }}
              onClick={() => pick(a.id)}
              role="radio"
              aria-checked={accent === a.id}
              aria-label={a.label}
              title={a.label}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function PuzzlesSection({
  userId,
  onOpenCreate,
  onOpenDraft,
}: {
  userId: string;
  onOpenCreate: () => void;
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
      {puzzles === null ? (
        <TileListSkeleton rows={2} />
      ) : puzzles.length === 0 ? (
        <p className="account-empty">
          You haven't published a puzzle yet — start one with "+ New" above.
        </p>
      ) : (
        <ul className="card-list">
          {puzzles.map((p) => (
            <Card key={p.id} className="account-tile">
              <span className="ai-source">{p.title}</span>
              <span className="ai-author">
                {VISIBILITY_LABEL[p.visibility]}
                {p.visibility !== "draft" &&
                  ` · ${p.completions} ${p.completions === 1 ? "solve" : "solves"}`}
              </span>
              <div className="account-tile-actions">
                <button
                  onClick={() => onOpenDraft(p.id)}
                  aria-label={`Edit "${p.title}"`}
                  title="Edit"
                >
                  <EditIcon />
                </button>
                <button
                  onClick={() => void onDelete(p)}
                  aria-label={`Delete "${p.title}"`}
                  title="Delete"
                >
                  <DeleteIcon />
                </button>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Followers + Following as one unit: both need the "who do I follow" list
 *  (Following to render it, Followers for its follow-back buttons), and a
 *  follow-back has to show up in both at once — so the list lives here. */
function SocialSections({ userId }: { userId: string }) {
  const [following, setFollowing] = useState<Profile[] | null>(null);
  const refresh = () => {
    listFollowing(userId).then(setFollowing);
  };
  useEffect(refresh, [userId]);

  return (
    <>
      <FollowersSection userId={userId} following={following} onFollowingChanged={refresh} />
      <FollowingSection
        userId={userId}
        following={following}
        onFollowingChanged={refresh}
      />
      <details className="follow-info">
        <summary>How following works — what's shared</summary>
        <ul>
          <li>
            Following someone puts their <strong>public</strong> puzzles in your feed. It's
            one-way: they see nothing of yours unless they follow you too.
          </li>
          <li>
            When you follow each other (mutuals), you also see each other's{" "}
            <strong>Mutuals only</strong> puzzles, and each other's <strong>progress</strong> on
            any puzzle — just the solved tick or % filled, never your answers or solve times.
          </li>
          <li>
            <strong>Unlisted</strong> puzzles are reachable only by their direct link, and{" "}
            <strong>drafts</strong> stay private to you. A puzzle's solve count includes everyone
            who's finished it, follower or not.
          </li>
        </ul>
      </details>
    </>
  );
}

function FollowersSection({
  userId,
  following,
  onFollowingChanged,
}: {
  userId: string;
  following: Profile[] | null;
  onFollowingChanged: () => void;
}) {
  const [followers, setFollowers] = useState<Profile[] | null>(null);
  useEffect(() => {
    listFollowers(userId).then(setFollowers);
  }, [userId]);

  // No button at all until the following list has loaded — a follow-back
  // that pops in beside everyone and then vanishes off half of them would
  // just look like a glitch.
  const followingIds = following === null ? null : new Set(following.map((p) => p.user_id));

  const followBack = async (p: Profile) => {
    await follow(userId, p.user_id);
    onFollowingChanged();
  };

  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>Followers{followers && followers.length > 0 ? ` (${followers.length})` : ""}</h2>
      </div>
      {followers === null ? (
        <TileListSkeleton rows={2} avatar />
      ) : followers.length === 0 ? (
        <p className="account-empty">No one's following you yet.</p>
      ) : (
        <ul className="card-list">
          {followers.map((p) => (
            <Card key={p.user_id} className="account-tile">
              <div className="ai-row">
                <Avatar username={p.username} displayName={p.display_name} accent={p.accent} size={36} />
                <div className="ai-row-text">
                  <span className="ai-source">{p.display_name}</span>
                  <span className="ai-author">@{p.username}</span>
                </div>
              </div>
              {followingIds !== null && !followingIds.has(p.user_id) && (
                <div className="account-tile-actions">
                  <button
                    onClick={() => void followBack(p)}
                    aria-label={`Follow ${p.display_name} back`}
                    title="Follow back"
                  >
                    <UserPlusIcon />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowingSection({
  userId,
  following,
  onFollowingChanged,
}: {
  userId: string;
  following: Profile[] | null;
  onFollowingChanged: () => void;
}) {
  const [showFind, setShowFind] = useState(false);

  const followingIds = new Set((following ?? []).map((p) => p.user_id));

  const unfollowUser = async (p: Profile) => {
    await unfollow(userId, p.user_id);
    onFollowingChanged();
  };

  return (
    <section className="account-section">
      <div className="account-section-head">
        <h2>Following{following && following.length > 0 ? ` (${following.length})` : ""}</h2>
        <button className="btn" onClick={() => setShowFind(true)}>
          + Add
        </button>
      </div>

      {following === null ? (
        <TileListSkeleton rows={2} avatar />
      ) : following.length === 0 ? (
        <p className="account-empty">
          You're not following anyone yet — add friends with "+ Add" above.
        </p>
      ) : (
        <ul className="card-list">
          {following.map((p) => (
            <Card key={p.user_id} className="account-tile">
              <div className="ai-row">
                <Avatar username={p.username} displayName={p.display_name} accent={p.accent} size={36} />
                <div className="ai-row-text">
                  <span className="ai-source">{p.display_name}</span>
                  <span className="ai-author">@{p.username}</span>
                </div>
              </div>
              <div className="account-tile-actions">
                <button
                  onClick={() => void unfollowUser(p)}
                  aria-label={`Unfollow ${p.display_name}`}
                  title="Unfollow"
                >
                  <UserMinusIcon />
                </button>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {showFind && (
        <Modal title="Find people" onClose={() => setShowFind(false)}>
          <FindPeopleDialog
            userId={userId}
            followingIds={followingIds}
            onFollowingChanged={onFollowingChanged}
          />
        </Modal>
      )}
    </section>
  );
}

/** Body of the "Find people" modal: search-as-you-type over usernames.
 *  Anyone already followed — including someone just followed from these
 *  results — keeps their row but wears the corner tick instead of a follow
 *  button, so the list doesn't reshuffle under the cursor. */
function FindPeopleDialog({
  userId,
  followingIds,
  onFollowingChanged,
}: {
  userId: string;
  followingIds: Set<string>;
  onFollowingChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  // null = nothing searched yet, so an empty result list ("no matches")
  // is distinguishable from a blank input (no message at all).
  const [results, setResults] = useState<Profile[] | null>(null);
  // True only while a request is in flight (not during the debounce), so
  // fast typing doesn't strobe the skeleton.
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    // Debounced per keystroke; `cancelled` also drops any response that
    // comes back out of order after a newer keystroke superseded it.
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchProfiles(query, userId).then((found) => {
        if (cancelled) return;
        setResults(found);
        setSearching(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, userId]);

  const followUser = async (p: Profile) => {
    await follow(userId, p.user_id);
    onFollowingChanged();
  };

  return (
    <div className="find-people">
      <input
        className="text-input"
        placeholder="Search by username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {searching ? (
        <TileListSkeleton rows={2} avatar />
      ) : results !== null &&
        (results.length === 0 ? (
          <p className="account-empty">
            No players found with the username: "{query.trim()}"
          </p>
        ) : (
          <ul className="card-list">
            {results.map((p) => (
              <Card key={p.user_id} className="account-tile">
                <div className="ai-row">
                  <Avatar username={p.username} displayName={p.display_name} accent={p.accent} size={36} />
                  <div className="ai-row-text">
                    <span className="ai-source">{p.display_name}</span>
                    <span className="ai-author">@{p.username}</span>
                  </div>
                </div>
                {followingIds.has(p.user_id) ? (
                  <span className="ai-done" title="Following" aria-label={`Following ${p.display_name}`}>
                    <CheckIcon />
                  </span>
                ) : (
                  <div className="account-tile-actions">
                    <button
                      onClick={() => void followUser(p)}
                      aria-label={`Follow ${p.display_name}`}
                      title="Follow"
                    >
                      <UserPlusIcon />
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </ul>
        ))}
    </div>
  );
}
