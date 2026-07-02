import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSession, onAuthStateChange, signInWithGoogle, signOut } from "../lib/auth.ts";
import { reconcileAll } from "../lib/sync.ts";

interface AuthValue {
  status: "loading" | "signed-out" | "signed-in";
  user: User | null;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Bumps every time a sign-in reconcile finishes, so components reading
   *  localStorage directly (Archive's per-item badges) know to re-render. */
  syncVersion: number;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The app's one Context: auth is async, mutates from outside whatever
 *  render triggered it (magic-link callback, token refresh), and needs to
 *  reach several independent subtrees (Archive's header, Solver's save
 *  effect, the sign-in modal) — a better fit than threading a prop through
 *  every intermediate component. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const reconciledFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSession().then((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setStatus(session?.user ? "signed-in" : "signed-out");
    });

    const unsubscribe = onAuthStateChange((session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setStatus(session?.user ? "signed-in" : "signed-out");
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Reconcile once per sign-in (including session restore on page load), not
  // on every re-render — never while actively solving mid-puzzle.
  useEffect(() => {
    if (!user || reconciledFor.current === user.id) return;
    reconciledFor.current = user.id;
    reconcileAll(user.id)
      .catch(() => {})
      .then(() => setSyncVersion((v) => v + 1));
  }, [user]);

  const value: AuthValue = { status, user, signInWithGoogle, signOut, syncVersion };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
