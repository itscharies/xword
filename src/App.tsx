import { useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle, PuzzleIndexEntry } from "./types.ts";
import { isSource } from "./lib/sources.ts";
import type { PuzzleSource } from "./lib/sources.ts";
import { initTheme, updateFavicon } from "./lib/theme.ts";
import { useCrossword } from "./hooks/useCrossword.ts";
import { useAnagramPool } from "./hooks/useAnagramPool.ts";
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
import { getPuzzleById } from "./lib/puzzles.ts";
import { getSyndicatedPuzzle } from "./lib/syndicated.ts";
import { useAuth } from "./hooks/useAuthContext.tsx";
import { useProfile } from "./hooks/useProfile.ts";
import { useDocumentTitle } from "./hooks/useDocumentTitle.ts";
import { Grid } from "./components/Grid.tsx";
import { ClueList } from "./components/ClueList.tsx";
import { ClueBanner } from "./components/ClueBanner.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { MobileKeyboard } from "./components/MobileKeyboard.tsx";
import { CompletionModal } from "./components/CompletionModal.tsx";
import { ThemeControls } from "./components/ThemeControls.tsx";
import { Modal } from "./components/Modal.tsx";
import { Archive } from "./components/Archive.tsx";
import { Builder } from "./components/Builder.tsx";
import { AccountPage } from "./components/AccountPage.tsx";
import { Logo } from "./components/Logo.tsx";
import { AnagramHelper } from "./components/AnagramHelper.tsx";
import { AnagramOverlay } from "./components/AnagramOverlay.tsx";

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

/** Navigate with real URLs (History API) rather than a hash fragment. Flushes
 *  any debounced progress write first — otherwise it just sits on a timer in
 *  the background, which is harmless (the SPA keeps running) but leaves the
 *  save indicator, and the actual server write, lagging behind the nav. */
const goTo = (route: string) => {
  flushPendingPushes();
  window.history.pushState(null, "", BASE + route);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

/** A syndicated puzzle, preferring the database copy over the static file if
 *  one exists — checked in parallel so the common (not-yet-in-the-database)
 *  case pays no extra latency. */
async function fetchSyndicatedPuzzle(
  source: PuzzleSource,
  date: string,
): Promise<Puzzle | null> {
  const [fromDb, base] = await Promise.all([
    getSyndicatedPuzzle(source, date),
    fetch(`${BASE}puzzles/${source}/${date}.json`)
      .then((r) => r.json() as Promise<Puzzle>)
      .catch(() => null),
  ]);
  return fromDb ?? base;
}

export default function App() {
  const [index, setIndex] = useState<PuzzleIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState(readRoute);
  const indexFetchedRef = useRef(false);

  useEffect(() => {
    // Covers the browser back/forward buttons — goTo() flushes for in-app
    // links, but the history API itself fires popstate for those too, so
    // this only does real work for back/forward.
    const onPop = () => {
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

  // Every other route below is self-contained (fetches its own puzzle
  // directly); only the archive actually needs the full catalogue.
  const [routeSrc, routeDate] = route.split("/");
  const editParts = route.startsWith("edit/") ? route.slice(5).split("/") : null;
  const needsIndex = !(
    route === "create" ||
    route === "account" ||
    route.startsWith("p/") ||
    route.startsWith("draft/") ||
    (editParts && isSource(editParts[0]) && !!editParts[1]) ||
    (isSource(routeSrc) && !!routeDate)
  );

  useEffect(() => {
    if (!needsIndex || indexFetchedRef.current) return;
    indexFetchedRef.current = true;
    // The catalogue changes whenever a new puzzle lands, but GitHub Pages /
    // phones cache it — so bypass the cache (a cache-bust param + no-store) to
    // make sure freshly-deployed puzzles show up right away. The puzzle files
    // themselves are immutable, so they stay cached.
    fetch(`${BASE}puzzles/index.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`index.json ${r.status}`);
        return r.json() as Promise<PuzzleIndexEntry[]>;
      })
      .then(setIndex)
      .catch((e) => setError(String(e)));
  }, [needsIndex]);

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
  // landing now that there are many puzzles.
  if (error) return <div className="error">Failed to load puzzles: {error}</div>;
  if (!index || index.length === 0)
    return <div className="loading">Loading…</div>;

  return (
    <Archive
      index={index}
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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Pull this puzzle's remote progress into localStorage *before* mounting
  // Solver (which reads localStorage synchronously on mount) — without this,
  // a fresh device opening a puzzle link directly can render Solver before
  // the once-per-sign-in reconcileAll finishes, and nothing re-reads
  // localStorage afterwards, so the other device's progress never appears.
  useEffect(() => {
    setPuzzle(null);
    setNotFound(false);
    let cancelled = false;
    (async () => {
      const p = await fetchSyndicatedPuzzle(source, date);
      if (cancelled) return;
      if (!p) {
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
      if (!cancelled) setPuzzle(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, date, user]);

  if (notFound) return <div className="error">Puzzle not found.</div>;
  if (!puzzle) return <div className="loading">Loading puzzle…</div>;
  return <Solver puzzle={puzzle} onOpenArchive={onOpenArchive} />;
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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [completions, setCompletions] = useState(0);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setPuzzle(null);
    setNotFound(false);
    let cancelled = false;

    getPuzzleById(id).then(async (row) => {
      if (cancelled) return;
      if (!row) {
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
      if (!cancelled) {
        setPuzzle(row.data);
        setCompletions(row.completions);
        setAuthorId(row.author_id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (notFound) return <div className="error">Puzzle not found.</div>;
  if (!puzzle) return <div className="loading">Loading puzzle…</div>;
  return (
    <Solver
      puzzle={puzzle}
      onOpenArchive={onOpenArchive}
      communityId={id}
      authorId={authorId}
      completions={completions}
    />
  );
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
  if (!row) return <div className="loading">Loading draft…</div>;
  return (
    <Builder
      onOpenArchive={onOpenArchive}
      onOpenAccount={onOpenAccount}
      draftPuzzle={{ id: row.id, puzzle: row.data }}
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

  if (!puzzle) return <div className="loading">Loading puzzle…</div>;
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
}) {
  const saved = useMemo(
    () => (communityId ? loadCommunityProgress(communityId) : loadProgress(puzzle.source, puzzle.date)),
    [communityId, puzzle.source, puzzle.date],
  );
  const xw = useCrossword(puzzle, saved);
  const { user } = useAuth();
  const profile = useProfile();
  const isAdmin = profile !== "loading" && !!profile?.is_admin;
  const isOwner = !!communityId && !!user && authorId === user.id;
  // Admin edit access stays scoped to syndicated puzzles (no owner exists to
  // check against) — a community puzzle can only be edited by its author,
  // since the `puzzles` table's RLS update policy doesn't have an admin
  // override.
  const canEdit = isOwner || (isAdmin && !communityId);
  useDocumentTitle(puzzle.title);

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

  const { elapsed, setElapsed } = useTimer(
    !xw.completed && !paused,
    saved?.elapsed ?? 0,
  );

  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showAnagram, setShowAnagram] = useState(false);
  const [celebrated, setCelebrated] = useState(saved?.completed ?? false);
  const [rating, setRating] = useState(saved?.rating ?? 0);
  // Progress fetched from another tab/device that's newer than anything we've
  // pushed or seen ourselves — see the sync-check effect below.
  const [conflict, setConflict] = useState<Progress | null>(null);

  const isMobile = useMediaQuery("(max-width: 820px)");
  const anagramPool = useAnagramPool(showAnagram && isMobile);

  // Any open dialog (including the anagram overlay) takes over keyboard input —
  // the overlay routes keys into its own answer entry rather than the grid.
  const modalOpen = showModal || showSettings || showReset || showAnagram || !!conflict;

  // The updatedAt of the newest version of this puzzle's progress we've
  // already pushed or accounted for — anything newer we see from Supabase
  // must have come from another tab or device, not from us.
  const lastSyncedAtRef = useRef(saved?.updatedAt ?? 0);

  // Save indicator: "saving" the moment an edit schedules a debounced push,
  // "saved" once that request lands, then fades back to nothing after a
  // couple of seconds so it doesn't linger as permanent header clutter.
  const saveKey = communityId ? `community:${communityId}` : `${puzzle.source}:${puzzle.date}`;
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  useEffect(() => {
    setSaveStatus(null);
    return onSaveStatus(saveKey, setSaveStatus);
  }, [saveKey]);
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const t = setTimeout(() => setSaveStatus(null), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

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
    else saveProgress(puzzle.source, puzzle.date, progress);
  }, [communityId, puzzle.source, puzzle.date, xw.entries, xw.revealed, xw.completed, elapsed, xw.openCells, rating]);

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
    else pushProgress(user.id, puzzle.source, puzzle.date, progress);
  }, [communityId, puzzle.source, puzzle.date, xw.entries, xw.revealed, xw.completed, xw.openCells, rating, user]);

  // Periodically check whether another tab or device has pushed newer
  // progress for this puzzle — catches the case where the solver
  // accidentally left another window open and kept solving there. Checked
  // on an interval and whenever the tab regains focus, since that's the
  // moment it matters most.
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const remote = communityId
        ? await pullCommunityProgress(user.id, communityId)
        : await pullProgress(user.id, puzzle.source, puzzle.date);
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
  }, [user, communityId, puzzle.source, puzzle.date]);

  // "Load latest": adopt the other tab/device's answers.
  const acceptRemote = () => {
    if (!conflict) return;
    xw.loadExternal(conflict.entries, conflict.revealed);
    setElapsed(conflict.elapsed ?? 0);
    setRating(conflict.rating ?? 0);
    lastSyncedAtRef.current = conflict.updatedAt ?? Date.now();
    if (communityId) saveCommunityProgress(communityId, conflict);
    else saveProgress(puzzle.source, puzzle.date, conflict);
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
      saveProgress(puzzle.source, puzzle.date, mine);
      pushProgress(user?.id ?? null, puzzle.source, puzzle.date, mine);
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
    <div className="app">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>{puzzle.title}</h1>
            <div className="byline">
              By {puzzle.author}
              {puzzle.editor ? ` · Edited by ${puzzle.editor}` : ""}
              {communityId && (
                <> · {completions} {completions === 1 ? "person" : "people"} solved this</>
              )}
              {saveStatus && (
                <span
                  className={`save-status save-status-${saveStatus}`}
                  title={saveStatus === "error" ? "Couldn't reach the server — check your connection." : undefined}
                >
                  {" · "}
                  {saveStatus === "saving"
                    ? "Saving…"
                    : saveStatus === "saved"
                      ? "Saved ✓"
                      : "Sync failed ⚠"}
                </span>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <button
            className="btn"
            onClick={() =>
              goTo(communityId ? `draft/${communityId}` : `edit/${puzzle.source}/${puzzle.date}`)
            }
          >
            ✎ Edit
          </button>
        )}
      </header>

      <div className="actionbar">
        <Toolbar
          xw={xw}
          onRequestReset={() => setShowReset(true)}
          onAnagram={() => setShowAnagram(true)}
        />
        <div className="actionbar-controls">
          <div className="timer-group">
            <button
              className="btn icon-btn"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Resume timer" : "Pause timer"}
              title={paused ? "Resume" : "Pause"}
            >
              {paused ? "▶" : "❚❚"}
            </button>
            <div className={`timer ${paused ? "paused" : ""}`}>
              {formatTime(elapsed)}
            </div>
          </div>
          <button
            className="btn cog-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

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
          <Grid puzzle={puzzle} xw={xw} />
        </div>
        <ClueList puzzle={puzzle} xw={xw} />
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
        <AnagramHelper xw={xw} onClose={() => setShowAnagram(false)} />
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
    </div>
  );
}
