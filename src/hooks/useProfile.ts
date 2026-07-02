import { useEffect, useState } from "react";
import { useAuth } from "./useAuthContext.tsx";
import { getProfile, type Profile } from "../lib/profile.ts";

/** The signed-in user's own `profiles` row — `null` if signed out or no
 *  profile claimed yet, `"loading"` while the check is in flight. Shared by
 *  every page that needs to branch on "has this user set up a username" or
 *  "is this user an admin". */
export function useProfile(): Profile | null | "loading" {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null | "loading">("loading");

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfile("loading");
    getProfile(user.id).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return profile;
}
