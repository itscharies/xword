import { useEffect, useState } from "react";
import { useAuth } from "./useAuthContext.tsx";
import { getProfile, type Profile } from "../lib/profile.ts";

const CACHE_PREFIX = "xword:profile:";

/** The last profile the server returned for this user — `null` when it
 *  confirmed none was claimed, `undefined` when nothing is cached. Lets the
 *  header paint the avatar at first render and keep it when a fetch fails
 *  offline, where the auth seed already keeps the user signed in; without it
 *  the header fell back to the signed-out glyph. */
function readCachedProfile(userId: string): Profile | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    return raw === null ? undefined : (JSON.parse(raw) as Profile | null);
  } catch {
    return undefined;
  }
}

function writeCachedProfile(userId: string, profile: Profile | null): void {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(profile));
  } catch {
    // Best-effort cache; the next fetch repopulates it.
  }
}

function clearCachedProfiles(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clear, or storage unavailable.
  }
}

/** The signed-in user's own `profiles` row — `null` if signed out or no
 *  profile claimed yet, `"loading"` while the check is in flight. Shared by
 *  every page that needs to branch on "has this user set up a username" or
 *  "is this user an admin". */
export function useProfile(): Profile | null | "loading" {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null | "loading">(() =>
    user ? (readCachedProfile(user.id) ?? "loading") : null,
  );

  useEffect(() => {
    if (!user) {
      clearCachedProfiles();
      setProfile(null);
      return;
    }
    let cancelled = false;
    const cached = readCachedProfile(user.id);
    setProfile(cached ?? "loading");
    getProfile(user.id).then(
      (p) => {
        if (cancelled) return;
        writeCachedProfile(user.id, p);
        setProfile(p);
      },
      (err) => {
        console.error("[profile] fetch failed; keeping the cached profile", err);
        // No cached copy to fall back on: "loading" forever would be a
        // permanent shimmer, so settle on the same unknown as before.
        if (!cancelled && cached === undefined) setProfile(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  return profile;
}
