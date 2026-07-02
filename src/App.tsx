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
} from "./lib/storage.ts";
import { pullCommunityProgress, pushCommunityProgress, pushProgress } from "./lib/sync.ts";
import { getPuzzleById } from "./lib/puzzles.ts";
import { useAuth } from "./hooks/useAuthContext.tsx";
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

/** Navigate with real URLs (History API) rather than a hash fragment. */
const goTo = (route: string) => {
  window.history.pushState(null, "", BASE + route);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

export default function App() {
  const [index, setIndex] = useState<PuzzleIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Track the OS colour scheme (for "system" mode) and draw the favicon.
  useEffect(() => {
    initTheme();
    updateFavicon();
  }, []);

  useEffect(() => {
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
  }, []);

  // Builder page — self-contained, so it works even before (or without) the
  // puzzle catalogue loading.
  if (route === "create") {
    return (
      <Builder onOpenArchive={() => goTo("")} onOpenAccount={() => goTo("account")} />
    );
  }

  // Account page — also self-contained, so signing in doesn't depend on the
  // puzzle catalogue having loaded (and survives the OAuth redirect back).
  if (route === "account") return <AccountPage onOpenArchive={() => goTo("")} />;

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

  if (error) return <div className="error">Failed to load puzzles: {error}</div>;
  if (!index || index.length === 0)
    return <div className="loading">Loading…</div>;

  // A valid "<source>/<date>" path shows that puzzle; anything else (including
  // the root) shows the archive — the default landing now that there are many.
  const [src, date] = route.split("/");
  const valid =
    isSource(src) && date && index.some((p) => p.source === src && p.date === date);

  if (!valid) {
    return (
      <Archive
        index={index}
        onPick={(source, d) => goTo(`${source}/${d}`)}
        onOpenAccount={() => goTo("account")}
        onOpenCreate={() => goTo("create")}
        onOpenPuzzle={(id) => goTo(`p/${id}`)}
      />
    );
  }

  return (
    <PuzzleView
      key={`${src}/${date}`}
      source={src as PuzzleSource}
      date={date}
      onOpenArchive={() => goTo("")}
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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  useEffect(() => {
    setPuzzle(null);
    fetch(`${BASE}puzzles/${source}/${date}.json`)
      .then((r) => r.json() as Promise<Puzzle>)
      .then(setPuzzle)
      .catch(() => setPuzzle(null));
  }, [source, date]);

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
      completions={completions}
    />
  );
}

function Solver({
  puzzle,
  onOpenArchive,
  communityId,
  completions,
}: {
  puzzle: Puzzle;
  onOpenArchive: () => void;
  /** Set for a published (/p/<id>) puzzle — switches progress storage/sync
   *  to be keyed by puzzle id instead of (source, date). */
  communityId?: string;
  /** How many people have completed this published puzzle. */
  completions?: number;
}) {
  const saved = useMemo(
    () => (communityId ? loadCommunityProgress(communityId) : loadProgress(puzzle.source, puzzle.date)),
    [communityId, puzzle.source, puzzle.date],
  );
  const xw = useCrossword(puzzle, saved);

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

  const isMobile = useMediaQuery("(max-width: 820px)");
  const anagramPool = useAnagramPool(showAnagram && isMobile);

  // Any open dialog (including the anagram overlay) takes over keyboard input —
  // the overlay routes keys into its own answer entry rather than the grid.
  const modalOpen = showModal || showSettings || showReset || showAnagram;

  // Persist progress whenever it changes — locally always, and to Supabase
  // (debounced) when signed in.
  const { user } = useAuth();
  useEffect(() => {
    const total = xw.openCells.length;
    const filled = xw.openCells.reduce(
      (n, p) => n + (xw.entries[p.row][p.col] ? 1 : 0),
      0,
    );
    const progress = {
      entries: xw.entries,
      revealed: [...xw.revealed],
      elapsed,
      completed: xw.completed,
      filled,
      total,
      rating: rating || undefined,
      updatedAt: Date.now(),
    };
    if (communityId) {
      saveCommunityProgress(communityId, progress);
      pushCommunityProgress(user?.id ?? null, communityId, progress);
    } else {
      saveProgress(puzzle.source, puzzle.date, progress);
      pushProgress(user?.id ?? null, puzzle.source, puzzle.date, progress);
    }
  }, [communityId, puzzle.source, puzzle.date, xw.entries, xw.revealed, xw.completed, elapsed, xw.openCells, rating, user]);

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
          <button
            className="title-block title-link"
            onClick={onOpenArchive}
            title="Browse all puzzles"
          >
            <h1>{puzzle.title}</h1>
            <div className="byline">
              By {puzzle.author}
              {puzzle.editor ? ` · Edited by ${puzzle.editor}` : ""}
              {communityId && (
                <> · {completions} {completions === 1 ? "person" : "people"} solved this</>
              )}
            </div>
          </button>
        </div>
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
    </div>
  );
}
