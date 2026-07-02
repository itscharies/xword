import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuthContext.tsx";
import {
  claimProfile,
  follow,
  getProfile,
  listFollowing,
  searchProfiles,
  unfollow,
  type Profile,
} from "../lib/profile.ts";

/** Body of the "Account" modal. Branches on auth + profile state: signed
 *  out -> magic link form; signed in with no `profiles` row yet -> claim a
 *  username/display name; otherwise -> account info + follow search. */
export function SignIn() {
  const { status, user, signInWithOtp, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null | "loading">("loading");

  useEffect(() => {
    if (!user) {
      setProfile("loading");
      return;
    }
    let cancelled = false;
    getProfile(user.id).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (status === "loading") return null;

  if (!user) return <SignInForm signInWithOtp={signInWithOtp} />;

  if (profile === "loading") return null;

  if (!profile) {
    return (
      <ClaimProfileForm userId={user.id} onClaimed={setProfile} />
    );
  }

  return (
    <>
      <div className="setting-row">
        <span className="setting-label">Account</span>
        <div className="savedata-actions">
          <span>
            {profile.display_name} <span className="savedata-status">@{profile.username}</span>
          </span>
          <button className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <FollowPanel userId={user.id} />
    </>
  );
}

function SignInForm({
  signInWithOtp,
}: {
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setMessage(null);
    const { error } = await signInWithOtp(email.trim());
    setSending(false);
    setMessage(error ? error : "Check your email for a sign-in link.");
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Sign in</span>
      <form className="savedata-actions" onSubmit={submit}>
        <input
          className="text-input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <button className="btn" type="submit" disabled={sending}>
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {message && <span className="savedata-status">{message}</span>}
    </div>
  );
}

function ClaimProfileForm({
  userId,
  onClaimed,
}: {
  userId: string;
  onClaimed: (p: Profile) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const { error } = await claimProfile(userId, username.trim().toLowerCase(), displayName);
    setSaving(false);
    if (error) setError(error);
    else onClaimed({ user_id: userId, username: username.trim().toLowerCase(), display_name: displayName.trim() });
  };

  return (
    <div className="setting-row">
      <span className="setting-label">Set up your profile</span>
      <form className="settings" onSubmit={submit} style={{ gap: 10 }}>
        <input
          className="text-input"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
          required
        />
        <input
          className="text-input"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          pattern="[a-z0-9_]{3,20}"
          title="3-20 lowercase letters, numbers, or underscores"
          required
        />
        <button className="btn" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>
      {error && <span className="savedata-status">{error}</span>}
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
