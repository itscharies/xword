import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getSession, onAuthStateChange, readStoredUser, signInWithGoogle, signOut } from "../lib/auth.ts";
import { reconcileAll } from "../lib/sync.ts";
import { getConnState, onConnChange } from "../lib/online.ts";
import { withTimeout } from "../lib/timeout.ts";

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
  // Seeded synchronously from auth-js's stored session so an offline
  // relaunch paints signed-in straight away; the async path below confirms
  // or corrects it.
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [status, setStatus] = useState<AuthValue["status"]>(user ? "signed-in" : "loading");
  const [syncVersion, setSyncVersion] = useState(0);
  const reconciledFor = useRef<string | null>(null);
  const userRef = useRef<User | null>(user);

  useEffect(() => {
    let cancelled = false;

    const adopt = (nextUser: User | null) => {
      userRef.current = nextUser;
      setUser(nextUser);
      setStatus(nextUser ? "signed-in" : "signed-out");
    };

    // Supabase re-notifies with a freshly-deserialized session (a new `user`
    // object) every time the tab regains focus, even when nothing actually
    // changed — its visibility handler re-emits SIGNED_IN unconditionally.
    // Skip the state update when the id hasn't changed so components keyed
    // off `user` don't mistake a refocus for a sign-in and flash back to
    // their loading state.
    //
    // A null session is only a sign-out when auth-js says so: a `retryable`
    // null means the stored token expired and the refresh couldn't reach the
    // network, and INITIAL_SESSION null while we already hold a seeded user
    // is the same thing arriving via the listener (auth-js emits it before
    // its refresh attempt settles). Both keep the user; the next
    // TOKEN_REFRESHED or SIGNED_OUT resolves it for real.
    const applySession = (session: Session | null, event: AuthChangeEvent | null, retryable: boolean) => {
      if (cancelled) return;
      const nextUser = session?.user ?? null;
      if (nextUser) {
        if (userRef.current?.id === nextUser.id) return;
        adopt(nextUser);
        return;
      }
      if (event === "SIGNED_OUT" || (!retryable && event !== "INITIAL_SESSION")) {
        adopt(null);
        return;
      }
      if (userRef.current) return;
      setStatus("signed-out");
    };

    getSession().then(({ session, retryable }) => applySession(session, null, retryable));
    const unsubscribe = onAuthStateChange((event, session) => applySession(session, event, false));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Reconcile once per sign-in (including session restore on page load), not
  // on every re-render — never while actively solving mid-puzzle. Offline it
  // is deferred, not skipped: `reconciledFor` stays unset so the reconnect
  // listener below runs it then. The timeout covers "connected but no
  // internet", where the request would otherwise hang indefinitely.
  const runReconcile = (u: User) => {
    if (reconciledFor.current === u.id || getConnState() !== "online") return;
    reconciledFor.current = u.id;
    withTimeout(reconcileAll(u.id), 15_000, "reconcile")
      .catch((e) => {
        console.error("[sync] reconcileAll threw", e);
        if (reconciledFor.current === u.id) reconciledFor.current = null;
      })
      .then(() => setSyncVersion((v) => v + 1));
  };

  useEffect(() => {
    if (user) runReconcile(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(
    () =>
      onConnChange((s) => {
        const u = userRef.current;
        if (s === "online" && u && reconciledFor.current !== u.id) runReconcile(u);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const value: AuthValue = { status, user, signInWithGoogle, signOut, syncVersion };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
