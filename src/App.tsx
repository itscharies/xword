import { useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle } from "./types.ts";
import { isSource } from "./lib/sources.ts";
import type { PuzzleSource } from "./lib/sources.ts";
import { initTheme, updateFavicon } from "./lib/theme.ts";
import { confirmLeave } from "./lib/navGuard.ts";
import { useCrossword, type CoopOptions } from "./hooks/useCrossword.ts";
import { useSession, type CoopBridge } from "./hooks/useSession.ts";
import { progressFromSessionState, stateFromProgress } from "./lib/coop.ts";
import {
  createSession,
  getSessionPreview,
  joinSession,
  sessionsEnabled,
  type JoinResult,
  type SessionPreview,
} from "./lib/session.ts";
import { useAnagramHelperStore, useAnagramPool } from "./hooks/useAnagramPool.ts";
import { formatTime, useTimer } from "./hooks/useTimer.ts";
import {
  loadCommunityProgress,
  loadProgress,
  saveCommunityProgress,
  saveProgress,
  type Progress,
} from "./lib/storage.ts";
import {
  flushPendingPushes,
  onSaveStatus,
  pullCommunityProgress,
  pullProgress,
  pushCommunityProgress,
  pushProgress,
  type SaveStatus,
} from "./lib/sync.ts";
import {
  getPuzzleById,
  getPuzzleWithSolves,
  type MutualProgress,
  type PublishedPuzzle,
} from "./lib/puzzles.ts";
import { getSyndicatedPuzzle, getSyndicatedWithSolves } from "./lib/syndicated.ts";
import { useAuth } from "./hooks/useAuthContext.tsx";
import { useProfile } from "./hooks/useProfile.ts";
import { useDocumentTitle } from "./hooks/useDocumentTitle.ts";
import { useFullscreen } from "./hooks/useFullscreen.ts";
import { useGridFit } from "./hooks/useGridFit.ts";
import { useStuck } from "./hooks/useStuck.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { Grid } from "./components/Grid.tsx";
import { GridCanvas } from "./components/GridCanvas.tsx";
import { SessionBar } from "./components/SessionBar.tsx";
import { SessionInviteDialog } from "./components/SessionInviteDialog.tsx";
import { ClaimProfileForm } from "./components/ClaimProfileForm.tsx";
import { AvatarStack } from "./components/AvatarStack.tsx";
import { ClueList } from "./components/ClueList.tsx";
import { ClueBanner } from "./components/ClueBanner.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { MobileKeyboard } from "./components/MobileKeyboard.tsx";
import { CompletionModal } from "./components/CompletionModal.tsx";
import { SolvesFlyout } from "./components/SolvesFlyout.tsx";
import { Tip } from "./components/Tip.tsx";
import { ThemeControls } from "./components/ThemeControls.tsx";
import { Modal } from "./components/Modal.tsx";
import { Archive } from "./components/Archive.tsx";
import { Builder } from "./components/Builder.tsx";
import { AccountPage } from "./components/AccountPage.tsx";
import { Logo } from "./components/Logo.tsx";
import { SolverSkeleton } from "./components/Skeleton.tsx";
import { AnagramHelper } from "./components/AnagramHelper.tsx";
import { AnagramOverlay } from "./components/AnagramOverlay.tsx";
import { MockAuthSwitcher } from "./components/MockAuthSwitcher.tsx";
import {
  EditIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  PauseIcon,
  PeopleIcon,
  PlayIcon,
  SettingsIcon,
} from "./components/icons.tsx";

const MOCK_MODE = import.meta.env.VITE_MOCK_BACKEND === "1";

const BASE = import.meta.env.BASE_URL; // e.g. "/xword/"

/** Track a CSS media query (used to switch the anagram helper's layout). */
function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    setMatch(m.matches);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** The route path after the base, e.g. "" (archive) or "gdn-cryptic/20260615". */
const readRoute = () => {
  let p = window.location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  return p.replace(/^\/+|\/+$/g, "");
};

/** Set by goTo for the popstate it dispatches itself, so the leave guard
 *  (already consulted in goTo) isn't asked a second time by onPop. */
let navApproved = false;

/** Navigate with real URLs (History API) rather than a hash fragment. Asks
 *  the current view's leave guard first (the builder holds unsaved work).
 *  Flushes any debounced progress write — otherwise it just sits on a timer
 *  in the background, which is harmless (the SPA keeps running) but leaves
 *  the actual server write lagging behind the nav. */
const goTo = (route: string) => {
  if (!confirmLeave()) return;
  navApproved = true;
  flushPendingPushes();
  window.history.pushState(null, "", BASE + route);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/** A syndicated puzzle — the `syndicated_puzzles` table is the canonical
 *  store (see lib/syndicated.ts); there's no static-file fallback to check
 *  any more now that every puzzle has been backfilled into it. */
async function fetchSyndicatedPuzzle(
  source: PuzzleSource,
  date: string,
): Promise<Puzzle | null> {
  return getSyndicatedPuzzle(source, date);
}

/** Local (browser) "today" as an ISO date string, matching Puzzle.isoDate's
 *  format. */
function isFutureIso(iso: string): boolean {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return iso > today;
}

export default function App() {
  return (
    <>
      <AppRoutes />
      {/* Only mounted for `npm run dev:mock` — flips the mock backend's
          "signed in as" state. See MockAuthSwitcher.tsx. */}
      {MOCK_MODE && <MockAuthSwitcher />}
    </>
  );
}

function AppRoutes() {
  const [route, setRoute] = useState(readRoute);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    // Covers the browser back/forward buttons — goTo() flushes for in-app
    // links, but the history API itself fires popstate for those too, so
    // this only does real work for back/forward.
    const onPop = () => {
      if (navApproved) {
        navApproved = false; // goTo already asked the leave guard
      } else if (!confirmLeave()) {
        // Back/forward already moved the URL — put the current view's URL
        // back and stay (this drops the forward stack; best effort).
        window.history.pushState(null, "", BASE + routeRef.current);
        return;
      }
      flushPendingPushes();
      setRoute(readRoute());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Track the OS colour scheme (for "system" mode) and draw the favicon.
  useEffect(() => {
    initTheme();
    updateFavicon();
  }, []);

  const [routeSrc, routeDate] = route.split("/");

  // Builder page — self-contained, so it works even before (or without) the
  // puzzle catalogue loading.
  if (route === "create") {
    return (
      <Builder onOpenArchive={() => goTo("")} onOpenAccount={() => goTo("account")} />
    );
  }

  // Account page — also self-contained, so signing in doesn't depend on the
  // puzzle catalogue having loaded (and survives the OAuth redirect back).
  if (route === "account") {
    return (
      <AccountPage
        onOpenArchive={() => goTo("")}
        onOpenCreate={() => goTo("create")}
        onOpenPuzzle={(id) => goTo(`p/${id}`)}
        onOpenDraft={(id) => goTo(`draft/${id}`)}
      />
    );
  }

  // Multiplayer co-op session — invite link, keyed by the session's uuid.
  // ("s" can never collide with the <source>/<date> branch below: it isn't
  // a valid PuzzleSource.)
  if (route.startsWith("s/")) {
    return (
      <SessionView key={route} id={route.slice(2)} onOpenArchive={() => goTo("")} />
    );
  }

  // Published community puzzle — also self-contained; it isn't in the
  // static index.json catalogue at all, it's fetched from Supabase.
  if (route.startsWith("p/")) {
    return (
      <CommunityPuzzleView
        key={route}
        id={route.slice(2)}
        onOpenArchive={() => goTo("")}
      />
    );
  }

  // Admin fix-up: load an existing syndicated puzzle into the Builder.
  if (route.startsWith("edit/")) {
    const [editSource, editDate] = route.slice(5).split("/");
    if (isSource(editSource) && editDate) {
      return (
        <EditPuzzleView
          key={route}
          source={editSource}
          date={editDate}
          onOpenArchive={() => goTo("")}
          onOpenAccount={() => goTo("account")}
        />
      );
    }
  }

  // Continue an unpublished draft from My Puzzles.
  if (route.startsWith("draft/")) {
    return (
      <DraftPuzzleView
        key={route}
        id={route.slice(6)}
        onOpenArchive={() => goTo("")}
        onOpenAccount={() => goTo("account")}
      />
    );
  }

  // A "<source>/<date>" path shows that puzzle directly — PuzzleView fetches
  // it itself and reports not-found, so this doesn't wait on the catalogue.
  if (isSource(routeSrc) && routeDate) {
    return (
      <PuzzleView
        key={`${routeSrc}/${routeDate}`}
        source={routeSrc as PuzzleSource}
        date={routeDate}
        onOpenArchive={() => goTo("")}
      />
    );
  }

  // Anything else (including the root) shows the archive — the default
  // landing now that there are many puzzles. It fetches its own first page
  // (see listArchivePage), so nothing here needs to wait on a catalogue.
  return (
    <Archive
      onPick={(source, d) => goTo(`${source}/${d}`)}
      onOpenAccount={() => goTo("account")}
      onOpenPuzzle={(id) => goTo(`p/${id}`)}
    />
  );
}

function PuzzleView({
  source,
  date,
  onOpenArchive,
}: {
  source: PuzzleSource;
  date: string;
  onOpenArchive: () => void;
}) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{ puzzle: Puzzle; mutualProgress: MutualProgress[] } | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Pull this puzzle's remote progress into localStorage *before* mounting
  // Solver (which reads localStorage synchronously on mount) — without this,
  // a fresh device opening a puzzle link directly can render Solver before
  // the once-per-sign-in reconcileAll finishes, and nothing re-reads
  // localStorage afterwards, so the other device's progress never appears.
  useEffect(() => {
    setLoaded(null);
    setNotFound(false);
    let cancelled = false;
    (async () => {
      // Mutuals' solves ride along on the same fetch (see the migration) —
      // no separate request for the solves segment to pop in from.
      const res = await getSyndicatedWithSolves(source, date);
      if (cancelled) return;
      // The backend's merged feed already excludes puzzles fetched ahead of
      // their real publish date; this closes the same gap for someone
      // guessing the direct /<source>/<date> URL. Deliberately not applied
      // in EditPuzzleView below — an admin fixing a bad parse needs to
      // reach it before publish day too.
      if (!res || isFutureIso(res.puzzle.isoDate)) {
        setNotFound(true);
        return;
      }
      if (user) {
        const remote = await pullProgress(user.id, source, date);
        if (remote) {
          const local = loadProgress(source, date);
          if (!local || (remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            saveProgress(source, date, remote);
          }
        }
      }
      if (!cancelled) setLoaded(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, date, user]);

  if (notFound) return <div className="error">Puzzle not found.</div>;
  if (!loaded) return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  return (
    <Solver
      puzzle={loaded.puzzle}
      onOpenArchive={onOpenArchive}
      mutualProgress={loaded.mutualProgress}
    />
  );
}

/** A published puzzle, fetched from Supabase by id rather than the static
 *  catalogue. Reconciles remote progress into localStorage *before*
 *  mounting Solver, so its synchronous initial load already sees the
 *  merged state — mirrors how PuzzleView above waits for the puzzle JSON
 *  itself before mounting. */
function CommunityPuzzleView({
  id,
  onOpenArchive,
}: {
  id: string;
  onOpenArchive: () => void;
}) {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{
    puzzle: PublishedPuzzle;
    mutualProgress: MutualProgress[];
  } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoaded(null);
    setNotFound(false);
    let cancelled = false;

    // Mutuals' solves ride along on the same fetch — see PuzzleView.
    getPuzzleWithSolves(id).then(async (res) => {
      if (cancelled) return;
      if (!res) {
        setNotFound(true);
        return;
      }
      if (user) {
        const remote = await pullCommunityProgress(user.id, id);
        if (remote) {
          const local = loadCommunityProgress(id);
          if (!local || (remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            saveCommunityProgress(id, remote);
          }
        }
      }
      if (!cancelled) setLoaded(res);
    });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (notFound) return <div className="error">Puzzle not found.</div>;
  if (!loaded) return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  return (
    <Solver
      puzzle={loaded.puzzle.data}
      onOpenArchive={onOpenArchive}
      communityId={id}
      authorId={loaded.puzzle.author_id}
      completions={loaded.puzzle.completions}
      mutualProgress={loaded.mutualProgress}
    />
  );
}

/** Bare page shell for the session join flow's pre-Solver states (sign-in
 *  gate, claim-profile, warnings, ended notice). */
function SessionGate({
  onOpenArchive,
  title,
  children,
}: {
  onOpenArchive: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>{title}</h1>
          </div>
        </div>
      </header>
      <div className="session-gate">{children}</div>
    </div>
  );
}

/** A multiplayer co-op session, reached via its invite link (/s/<uuid>).
 *  Walks the visitor through whatever stands between them and the grid:
 *  sign-in, claiming a profile, and a warning when joining would replace
 *  their existing solo progress on the puzzle — then joins and mounts the
 *  Solver in session mode. */
function SessionView({
  id,
  onOpenArchive,
}: {
  id: string;
  onOpenArchive: () => void;
}) {
  const { status: authStatus, user, signInWithGoogle } = useAuth();
  const profile = useProfile();
  const [preview, setPreview] = useState<SessionPreview | null | "loading">("loading");
  const [join, setJoin] = useState<JoinResult | null>(null);
  const [joinFailed, setJoinFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!sessionsEnabled) return;
    let cancelled = false;
    setPreview("loading");
    setJoin(null);
    setJoinFailed(false);
    getSessionPreview(id).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const ready = preview !== "loading" && preview !== null;

  // Joining adopts the session's shared grid as this puzzle's progress —
  // warn first when there's solo progress here that would be replaced.
  // Existing participants (rejoins, refreshes) already crossed that bridge.
  const needsWarning = useMemo(() => {
    if (!ready || preview.is_participant) return false;
    const local = preview.puzzle_id
      ? loadCommunityProgress(preview.puzzle_id)
      : preview.source && preview.puzzle_date
        ? loadProgress(preview.source, preview.puzzle_date)
        : null;
    if (!local) return false;
    return local.completed || local.entries.some((row) => row.some(Boolean));
  }, [ready, preview]);

  const shouldJoin =
    sessionsEnabled &&
    ready &&
    preview.status !== "ended" &&
    !!user &&
    profile !== "loading" &&
    !!profile &&
    (!needsWarning || confirmed);

  useEffect(() => {
    if (!shouldJoin || join) return;
    let cancelled = false;
    joinSession(id).then((res) => {
      if (cancelled) return;
      if (res) setJoin(res);
      else setJoinFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldJoin, id]);

  if (!sessionsEnabled) {
    return (
      <SessionGate onOpenArchive={onOpenArchive} title="Solve together">
        <p>Solving together isn't available here.</p>
      </SessionGate>
    );
  }
  if (join) {
    return (
      <Solver
        puzzle={join.puzzle}
        onOpenArchive={onOpenArchive}
        communityId={join.session.puzzle_id ?? undefined}
        session={join}
      />
    );
  }
  if (joinFailed || preview === null) {
    return <div className="error">Session not found.</div>;
  }
  if (preview === "loading" || authStatus === "loading") {
    return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  }

  const title = preview.title ?? "Crossword";
  const soloRoute = preview.puzzle_id
    ? `p/${preview.puzzle_id}`
    : `${preview.source}/${preview.puzzle_date}`;

  if (preview.status === "ended") {
    return (
      <SessionGate onOpenArchive={onOpenArchive} title={title}>
        <p>This session has ended.</p>
        <button className="btn btn-accent" onClick={() => goTo(soloRoute)}>
          Solve it yourself
        </button>
      </SessionGate>
    );
  }
  if (!user) {
    const names = preview.participants.map((p) => p.display_name);
    return (
      <SessionGate onOpenArchive={onOpenArchive} title={title}>
        <div className="session-gate-people">
          <AvatarStack people={preview.participants.slice(0, 4)} />
          <span>
            {names.length > 0
              ? `${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} invited you to solve this together.`
              : "You've been invited to solve this together."}
          </span>
        </div>
        <p>Sign in to join the session.</p>
        <button
          className="btn btn-accent"
          onClick={() => void signInWithGoogle()}
        >
          Sign in with Google
        </button>
      </SessionGate>
    );
  }
  if (profile === "loading") {
    return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  }
  if (!profile) {
    return (
      <SessionGate onOpenArchive={onOpenArchive} title={title}>
        <p>Pick a username so the others can see who's solving with them.</p>
        <ClaimProfileForm userId={user.id} />
      </SessionGate>
    );
  }
  if (needsWarning && !confirmed) {
    return (
      <SessionGate onOpenArchive={onOpenArchive} title={title}>
        <p>
          You've already started this puzzle on your own. Joining the session
          replaces that progress with the group's shared grid.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={() => goTo(soloRoute)}>
            Keep solving solo
          </button>
          <button className="btn btn-accent" onClick={() => setConfirmed(true)}>
            Join the session
          </button>
        </div>
      </SessionGate>
    );
  }
  // Join in flight.
  return <SolverSkeleton onOpenArchive={onOpenArchive} />;
}

/** Continue an unpublished draft from My Puzzles — loads it back into the
 *  Builder rather than the Solver. */
function DraftPuzzleView({
  id,
  onOpenArchive,
  onOpenAccount,
}: {
  id: string;
  onOpenArchive: () => void;
  onOpenAccount: () => void;
}) {
  const [row, setRow] = useState<Awaited<ReturnType<typeof getPuzzleById>>>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setRow(null);
    setNotFound(false);
    let cancelled = false;
    getPuzzleById(id).then((r) => {
      if (cancelled) return;
      if (!r) setNotFound(true);
      else setRow(r);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) return <div className="error">Draft not found.</div>;
  if (!row) return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  return (
    <Builder
      onOpenArchive={onOpenArchive}
      onOpenAccount={onOpenAccount}
      draftPuzzle={{ id: row.id, puzzle: row.data, visibility: row.visibility }}
    />
  );
}

/** Admin-only: load an existing syndicated puzzle into the Builder to fix
 *  bad parsing. Fetches the same way PuzzleView does (database-or-static)
 *  so editing always starts from what solvers currently see. */
function EditPuzzleView({
  source,
  date,
  onOpenArchive,
  onOpenAccount,
}: {
  source: PuzzleSource;
  date: string;
  onOpenArchive: () => void;
  onOpenAccount: () => void;
}) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  useEffect(() => {
    setPuzzle(null);
    let cancelled = false;
    fetchSyndicatedPuzzle(source, date).then((p) => {
      if (!cancelled) setPuzzle(p);
    });
    return () => {
      cancelled = true;
    };
  }, [source, date]);

  if (!puzzle) return <SolverSkeleton onOpenArchive={onOpenArchive} />;
  return (
    <Builder
      onOpenArchive={onOpenArchive}
      onOpenAccount={onOpenAccount}
      editing={{ source, date, puzzle }}
    />
  );
}

function Solver({
  puzzle,
  onOpenArchive,
  communityId,
  authorId,
  completions,
  mutualProgress = [],
  session,
}: {
  puzzle: Puzzle;
  onOpenArchive: () => void;
  /** Set for a published (/p/<id>) puzzle — switches progress storage/sync
   *  to be keyed by puzzle id instead of (source, date). */
  communityId?: string;
  /** The published puzzle's author — used to decide whether the viewer can
   *  edit it. Unset for syndicated puzzles, which have no owner. */
  authorId?: string | null;
  /** How many people have completed this published puzzle. */
  completions?: number;
  /** Mutuals' progress on this puzzle — projected onto the puzzle fetch by
   *  the *_with_solves RPCs, so the solves segment needs no fetch of its
   *  own. */
  mutualProgress?: MutualProgress[];
  /** Set when solving inside a multiplayer co-op session (/s/<id>): the
   *  grid is shared and live-synced, the timer is the session's wall clock,
   *  and the solo-only affordances (pause, reset, the cross-device conflict
   *  poller) go away. */
  session?: JoinResult;
}) {
  // Only syndicated puzzles (no communityId) hit the `source`-keyed branches
  // below — those always carry a source, unlike community/authored puzzles.
  const source = puzzle.source as PuzzleSource;
  const saved = useMemo(
    () =>
      session
        ? progressFromSessionState(session.session.state ?? {}, puzzle)
        : communityId
          ? loadCommunityProgress(communityId)
          : loadProgress(source, puzzle.date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.session.id, communityId, source, puzzle.date],
  );
  // Local edits flow to the session through this ref (useSession fills the
  // handlers in once its channel client exists) — a ref rather than props
  // because the engine and the session hook need each other.
  const coopBridge = useRef<CoopBridge>({});
  const coopOptions = useMemo<CoopOptions | undefined>(
    () =>
      session
        ? {
            onCellsCommitted: (c) => coopBridge.current.onCells?.(c),
            onMarksCommitted: (m) => coopBridge.current.onMarks?.(m),
            readOnlyRevealed: true,
          }
        : undefined,
    [session],
  );
  const xw = useCrossword(puzzle, saved, coopOptions);
  const { user } = useAuth();
  const sApi = useSession(session ?? null, xw, user, coopBridge);
  const profile = useProfile();
  const isAdmin = profile !== "loading" && !!profile?.is_admin;
  const isOwner = !!communityId && !!user && authorId === user.id;
  // Admin edit access stays scoped to syndicated puzzles (no owner exists to
  // check against) — a community puzzle can only be edited by its author,
  // since the `puzzles` table's RLS update policy doesn't have an admin
  // override.
  const canEdit = isOwner || (isAdmin && !communityId);
  useDocumentTitle(puzzle.title);
  // Solving is long stretches of reading with no touches — keep the screen on.
  useWakeLock();

  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(paused);
  const setPaused = (v: boolean) => {
    pausedRef.current = v;
    setPausedState(v);
  };
  // Resume the moment the solver touches the grid, clues or keyboard again.
  const resume = () => {
    if (pausedRef.current) setPaused(false);
  };

  // In session mode the personal stopwatch is idle — the session's shared
  // wall clock (below) is what everyone sees, and it doesn't pause.
  const { elapsed: soloElapsed, setElapsed } = useTimer(
    !session && !xw.completed && !paused,
    saved?.elapsed ?? 0,
  );
  const elapsed = session ? (sApi?.elapsed ?? 0) : soloElapsed;

  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showAnagram, setShowAnagram] = useState(false);
  const [showInvite, setShowInvite] = useState(
    // The "lobby": a creator landing in their fresh session gets the invite
    // link front and centre while they wait — the grid stays usable behind.
    () => !!session && session.session.created_by === user?.id && session.participants.length === 1,
  );
  const [showCoopStart, setShowCoopStart] = useState(false);
  const [endedDismissed, setEndedDismissed] = useState(false);
  const [celebrated, setCelebrated] = useState(
    (saved?.completed ?? false) || session?.session.status === "completed",
  );
  const [rating, setRating] = useState(saved?.rating ?? 0);
  // Progress fetched from another tab/device that's newer than anything we've
  // pushed or seen ourselves — see the sync-check effect below.
  const [conflict, setConflict] = useState<Progress | null>(null);

  const isMobile = useMediaQuery("(max-width: 820px)");
  const gridFit = useGridFit();
  const actionbarRef = useStuck<HTMLDivElement>();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const anagramPool = useAnagramPool(showAnagram && isMobile);
  const anagramHelperStore = useAnagramHelperStore();

  const sessionEnded = !!sApi?.ended && !endedDismissed;

  // Any open dialog (including the anagram overlay) takes over keyboard input —
  // the overlay routes keys into its own answer entry rather than the grid.
  const modalOpen =
    showModal || showSettings || showReset || showAnagram || !!conflict ||
    showInvite || showCoopStart || sessionEnded;

  // The updatedAt of the newest version of this puzzle's progress we've
  // already pushed or accounted for — anything newer we see from Supabase
  // must have come from another tab or device, not from us.
  const lastSyncedAtRef = useRef(saved?.updatedAt ?? 0);

  // Save status, surfaced in the byline only when a push fails — the sign of
  // possible progress loss. The happy path stays silent: a transient
  // "Saving…"/"Saved ✓" made the byline wrap and reflow the board below it
  // every few keystrokes when the title ran long. A later successful push
  // clears the warning.
  const saveKey = communityId ? `community:${communityId}` : `${puzzle.source}:${puzzle.date}`;
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  useEffect(() => {
    setSaveStatus(null);
    return onSaveStatus(saveKey, setSaveStatus);
  }, [saveKey]);

  const buildProgress = (): Progress => ({
    entries: xw.entries,
    revealed: [...xw.revealed],
    elapsed,
    completed: xw.completed,
    filled: xw.openCells.reduce((n, p) => n + (xw.entries[p.row][p.col] ? 1 : 0), 0),
    total: xw.openCells.length,
    rating: rating || undefined,
    updatedAt: Date.now(),
  });

  // Local save ticks every second along with the timer, so a reload always
  // resumes from close to the right elapsed time.
  useEffect(() => {
    const progress = buildProgress();
    if (communityId) saveCommunityProgress(communityId, progress);
    else saveProgress(source, puzzle.date, progress);
  }, [communityId, source, puzzle.date, xw.entries, xw.revealed, xw.completed, elapsed, xw.openCells, rating]);

  // The Supabase push is debounced 1.5s after the *content* actually
  // changes — deliberately excludes `elapsed`. That ticks every second, and
  // if it were a dependency here it would re-arm the debounce every second
  // too, so the write would never actually go out while the timer runs (and
  // `pending` would look permanently non-empty to the beforeunload guard).
  const didMountRef = useRef(false);
  useEffect(() => {
    // Skip the run this effect does on mount just by describing the current
    // (unchanged) state — pushing then would arm `pending` for no reason,
    // and reloading a second later would trip the beforeunload warning even
    // though nothing was actually edited. Sign-in mid-session is still
    // covered: reconcileAll already syncs a newly-signed-in user's local
    // progress, so this only needs to react to genuine content changes.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!user) return;
    const progress = buildProgress();
    lastSyncedAtRef.current = progress.updatedAt!;
    if (communityId) pushCommunityProgress(user.id, communityId, progress);
    else pushProgress(user.id, source, puzzle.date, progress);
  }, [communityId, source, puzzle.date, xw.entries, xw.revealed, xw.completed, xw.openCells, rating, user]);

  // Periodically check whether another tab or device has pushed newer
  // progress for this puzzle — catches the case where the solver
  // accidentally left another window open and kept solving there. Checked
  // on an interval and whenever the tab regains focus, since that's the
  // moment it matters most. Stops once the puzzle is completed — a finished
  // puzzle is locked (see useCrossword) and won't push anything further of
  // its own, so there's nothing left to reconcile and no reason to keep
  // polling.
  useEffect(() => {
    // Session mode replaces this wholesale: the realtime channel is the
    // sync, and `acceptRemote`'s loadExternal would clobber the merged
    // shared grid (worse: our own pushes from a second tab would trip it).
    if (!user || xw.completed || session) return;
    const check = async () => {
      const remote = communityId
        ? await pullCommunityProgress(user.id, communityId)
        : await pullProgress(user.id, source, puzzle.date);
      if (!remote || (remote.updatedAt ?? 0) <= lastSyncedAtRef.current) return;
      setConflict((existing) => existing ?? remote);
    };
    const interval = setInterval(() => void check(), 30_000);
    const onFocus = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, communityId, source, puzzle.date, xw.completed, session]);

  // "Load latest": adopt the other tab/device's answers.
  const acceptRemote = () => {
    if (!conflict) return;
    xw.loadExternal(conflict.entries, conflict.revealed);
    setElapsed(conflict.elapsed ?? 0);
    setRating(conflict.rating ?? 0);
    lastSyncedAtRef.current = conflict.updatedAt ?? Date.now();
    if (communityId) saveCommunityProgress(communityId, conflict);
    else saveProgress(source, puzzle.date, conflict);
    setConflict(null);
  };

  // "Keep mine" (including dismissing the dialog any other way): push what's
  // here now with a fresh timestamp so it wins the next comparison instead
  // of the conflict resurfacing on the next check.
  const keepMine = () => {
    if (!conflict) return;
    const mine = buildProgress();
    lastSyncedAtRef.current = mine.updatedAt!;
    if (communityId) {
      saveCommunityProgress(communityId, mine);
      pushCommunityProgress(user?.id ?? null, communityId, mine);
    } else {
      saveProgress(source, puzzle.date, mine);
      pushProgress(user?.id ?? null, source, puzzle.date, mine);
    }
    setConflict(null);
  };

  // Celebrate the first time the puzzle is fully correct.
  useEffect(() => {
    if (xw.completed && !celebrated) {
      setCelebrated(true);
      setShowModal(true);
    }
  }, [xw.completed, celebrated]);

  // Physical keyboard — disabled while a dialog is open so typing doesn't leak
  // into the grid behind it.
  useEffect(() => {
    if (modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      resume();
      xw.handleKeyDown(e);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [xw.handleKeyDown, modalOpen]);

  return (
    <div className="app solver">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>{puzzle.title}</h1>
            <div className="byline">
              By {puzzle.author || "Anonymous"}
              {puzzle.editor ? ` · Edited by ${puzzle.editor}` : ""}
              {saveStatus === "error" && (
                <span className="save-status save-status-error">
                  {" · "}
                  <Tip
                    className="tip-text"
                    tip="Couldn't reach the server — check your connection."
                  >
                    Sync failed ⚠
                  </Tip>
                </span>
              )}
            </div>
            {session && sApi ? (
              <SessionBar
                session={sApi}
                userId={user?.id ?? null}
                onInvite={() => setShowInvite(true)}
              />
            ) : (
              <SolvesFlyout
                mutuals={mutualProgress}
                completions={communityId && isOwner ? completions : undefined}
              />
            )}
          </div>
        </div>
      </header>

      {/* display: contents outside [data-grid-fit="canvas"] — a transparent
          grouping node so the header can still scroll away above it there,
          leaving just the actionbar's icon row visible; see index.css. */}
      <div className="solve-body">
        <div className="actionbar" ref={actionbarRef}>
          <Toolbar
            xw={xw}
            onRequestReset={() => setShowReset(true)}
            onAnagram={() => setShowAnagram(true)}
            hideReset={!!session}
          />
          <div className="actionbar-controls">
            <div className="timer-group">
              {!session && (
                <button
                  className="btn icon-btn"
                  onClick={() => setPaused(!paused)}
                  aria-label={paused ? "Resume timer" : "Pause timer"}
                  title={paused ? "Resume" : "Pause"}
                >
                  {paused ? <PlayIcon /> : <PauseIcon />}
                </button>
              )}
              <div className={`timer ${paused ? "paused" : ""}`}>
                {formatTime(elapsed)}
              </div>
            </div>
            {!session && sessionsEnabled && (
              <button
                className="btn icon-btn"
                onClick={() => setShowCoopStart(true)}
                aria-label="Solve together"
                title="Solve together"
              >
                <PeopleIcon />
              </button>
            )}
            <button
              className="btn icon-btn desktop-only"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </button>
            {canEdit && (
              <button
                className="btn icon-btn"
                onClick={() =>
                  goTo(communityId ? `draft/${communityId}` : `edit/${puzzle.source}/${puzzle.date}`)
                }
                aria-label="Edit puzzle"
                title="Edit puzzle"
              >
                <EditIcon />
              </button>
            )}
            <button
              className="btn cog-btn"
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              title="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>

        {sApi && sApi.notices.length > 0 && (
          <div className="session-notices" aria-live="polite">
            {sApi.notices.map((n) => (
              <div className="session-notice" key={n.id}>
                {n.text}
              </div>
            ))}
          </div>
        )}

        <div
          className={`main ${showAnagram && isMobile ? "ana-open" : ""}`}
          onPointerDown={resume}
        >
          <div className="board">
            {/* Banner above the grid on desktop; hidden on mobile (shown in the
                sticky bottom bar instead). */}
            <div className="banner-desktop">
              <ClueBanner xw={xw} />
            </div>
            {/* Canvas mode swaps the plain grid for the pan/zoom viewport.
                The .grid-fit wrapper is inert outside fullscreen; in
                fullscreen it's the size container the grid measures its
                available height against. */}
            {gridFit === "canvas" ? (
              <GridCanvas puzzle={puzzle} xw={xw} remoteCursors={sApi?.cursors} />
            ) : (
              <div className="grid-fit">
                <Grid puzzle={puzzle} xw={xw} remoteCursors={sApi?.cursors} />
              </div>
            )}
          </div>
          <ClueList puzzle={puzzle} xw={xw} remoteCursors={sApi?.cursors} />
          {showAnagram && isMobile && <AnagramOverlay pool={anagramPool} />}
        </div>

        {/* Mobile only: clue bar + keyboard, stuck to the bottom of the viewport
            while the rest of the page scrolls. */}
        <div className="mobile-bar" onPointerDown={resume}>
          <ClueBanner xw={xw} />
          <MobileKeyboard
            xw={xw}
            onAnagram={() => setShowAnagram((v) => !v)}
            anagramPool={showAnagram && isMobile ? anagramPool : null}
          />
        </div>
      </div>

      {showModal && (
        <CompletionModal
          elapsed={elapsed}
          usedReveal={xw.revealed.size > 0}
          rating={rating}
          onRate={setRating}
          onClose={() => setShowModal(false)}
        />
      )}

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <ThemeControls />
        </Modal>
      )}

      {showReset && (
        <Modal title="Reset puzzle?" onClose={() => setShowReset(false)}>
          <p>This clears all your answers for this puzzle.</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowReset(false)}>
              Cancel
            </button>
            <button
              className="btn btn-accent"
              onClick={() => {
                xw.reset();
                setElapsed(0);
                setPaused(false);
                setCelebrated(false);
                setRating(0);
                setShowReset(false);
              }}
            >
              Reset
            </button>
          </div>
        </Modal>
      )}

      {showAnagram && !isMobile && (
        <AnagramHelper
          xw={xw}
          store={anagramHelperStore}
          onClose={() => setShowAnagram(false)}
        />
      )}

      {conflict && (
        <Modal title="Updated elsewhere" onClose={keepMine}>
          <p>
            This puzzle has newer progress saved from another window or device.
            Load it, or keep what's here and overwrite that instead.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={keepMine}>
              Keep mine
            </button>
            <button className="btn btn-accent" onClick={acceptRemote}>
              Load latest
            </button>
          </div>
        </Modal>
      )}

      {showInvite && sApi && (
        <SessionInviteDialog url={sApi.inviteUrl} onClose={() => setShowInvite(false)} />
      )}

      {showCoopStart && !session && (
        <CoopStartDialog
          source={source}
          date={puzzle.date}
          communityId={communityId}
          onClose={() => setShowCoopStart(false)}
        />
      )}

      {sessionEnded && (
        <Modal title="Session ended" onClose={() => setEndedDismissed(true)}>
          <p>
            This session wound down after 30 minutes without activity. The
            grid is saved as your own progress — keep going solo whenever you
            like.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setEndedDismissed(true)}>
              Close
            </button>
            <button
              className="btn btn-accent"
              onClick={() =>
                goTo(communityId ? `p/${communityId}` : `${source}/${puzzle.date}`)
              }
            >
              Keep solving solo
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The "Solve together" entry point, from a solo Solver's actionbar: walks
 *  through sign-in and profile-claim if needed, then creates the session
 *  (seeded from the current grid) and navigates into it. */
function CoopStartDialog({
  source,
  date,
  communityId,
  onClose,
}: {
  source: PuzzleSource;
  date: string;
  communityId?: string;
  onClose: () => void;
}) {
  const { user, signInWithGoogle } = useAuth();
  const profile = useProfile();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    if (!user || creating) return;
    setCreating(true);
    setError(null);
    const progress = communityId
      ? loadCommunityProgress(communityId)
      : loadProgress(source, date);
    const { id, error } = await createSession(
      communityId ? { puzzleId: communityId } : { source, date },
      stateFromProgress(progress, user.id),
    );
    if (id) {
      goTo(`s/${id}`);
      return;
    }
    setCreating(false);
    setError(error ?? "Couldn't create the session.");
  };

  return (
    <Modal title="Solve together" onClose={onClose}>
      {!user ? (
        <div className="setting-row">
          <p>Sign in to start a shared session and invite a friend.</p>
          <button className="btn btn-accent" onClick={() => void signInWithGoogle()}>
            Sign in with Google
          </button>
        </div>
      ) : profile === "loading" ? (
        <p>Loading…</p>
      ) : !profile ? (
        <div className="setting-row">
          <p>Pick a username first, so friends can see who's solving with them.</p>
          <ClaimProfileForm userId={user.id} />
        </div>
      ) : (
        <div className="setting-row">
          <p>
            Start a live session from your current grid and invite anyone with
            a link. You'll all solve the same puzzle together — and it becomes
            your progress on this puzzle from here on.
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-accent" onClick={() => void start()} disabled={creating}>
              {creating ? "Starting…" : "Start session"}
            </button>
          </div>
          {error && <span className="savedata-status">{error}</span>}
        </div>
      )}
    </Modal>
  );
}
