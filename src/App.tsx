import { useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle, PuzzleIndexEntry } from "./types.ts";
import { useCrossword } from "./hooks/useCrossword.ts";
import { formatTime, useTimer } from "./hooks/useTimer.ts";
import { loadLastDate, loadProgress, saveProgress } from "./lib/storage.ts";
import { Grid } from "./components/Grid.tsx";
import { ClueList } from "./components/ClueList.tsx";
import { ClueBanner } from "./components/ClueBanner.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { MobileKeyboard } from "./components/MobileKeyboard.tsx";
import { CompletionModal } from "./components/CompletionModal.tsx";
import { ThemeControls } from "./components/ThemeControls.tsx";
import { Modal } from "./components/Modal.tsx";
import { Archive } from "./components/Archive.tsx";

const BASE = import.meta.env.BASE_URL;

const hashRoute = () => window.location.hash.replace(/^#\/?/, "");
const goTo = (route: string) => {
  window.location.hash = route;
};

export default function App() {
  const [index, setIndex] = useState<PuzzleIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState(hashRoute);

  useEffect(() => {
    const onHash = () => setRoute(hashRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetch(`${BASE}puzzles/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index.json ${r.status}`);
        return r.json() as Promise<PuzzleIndexEntry[]>;
      })
      .then(setIndex)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Failed to load puzzles: {error}</div>;
  if (!index || index.length === 0)
    return <div className="loading">Loading…</div>;

  if (route === "list") {
    return <Archive index={index} onPick={(d) => goTo(d)} />;
  }

  // A valid date in the hash, else fall back to the last-played or newest.
  const isValidDate = /^\d{6}$/.test(route) && index.some((p) => p.date === route);
  const last = loadLastDate();
  const date = isValidDate
    ? route
    : last && index.some((p) => p.date === last)
      ? last
      : index[0].date;

  return (
    <PuzzleView key={date} date={date} onOpenArchive={() => goTo("list")} />
  );
}

function PuzzleView({
  date,
  onOpenArchive,
}: {
  date: string;
  onOpenArchive: () => void;
}) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  useEffect(() => {
    setPuzzle(null);
    fetch(`${BASE}puzzles/${date}.json`)
      .then((r) => r.json() as Promise<Puzzle>)
      .then(setPuzzle)
      .catch(() => setPuzzle(null));
  }, [date]);

  if (!puzzle) return <div className="loading">Loading puzzle…</div>;
  return <Solver puzzle={puzzle} onOpenArchive={onOpenArchive} />;
}

function Solver({
  puzzle,
  onOpenArchive,
}: {
  puzzle: Puzzle;
  onOpenArchive: () => void;
}) {
  const saved = useMemo(() => loadProgress(puzzle.date), [puzzle.date]);
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
  const [celebrated, setCelebrated] = useState(saved?.completed ?? false);

  const modalOpen = showModal || showSettings || showReset;

  // Persist progress whenever it changes.
  useEffect(() => {
    saveProgress(puzzle.date, {
      entries: xw.entries,
      revealed: [...xw.revealed],
      elapsed,
      completed: xw.completed,
    });
  }, [puzzle.date, xw.entries, xw.revealed, xw.completed, elapsed]);

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
        <button
          className="title-block title-link"
          onClick={onOpenArchive}
          title="Browse all puzzles"
        >
          <h1>{puzzle.title}</h1>
          <div className="byline">
            By {puzzle.author}
            {puzzle.editor ? ` · Edited by ${puzzle.editor}` : ""}
          </div>
        </button>
      </header>

      <div className="actionbar">
        <Toolbar xw={xw} onRequestReset={() => setShowReset(true)} />
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

      <div className="main" onPointerDown={resume}>
        <div className="board">
          {/* Banner above the grid on desktop; hidden on mobile (shown in the
              sticky bottom bar instead). */}
          <div className="banner-desktop">
            <ClueBanner xw={xw} />
          </div>
          <Grid puzzle={puzzle} xw={xw} />
        </div>
        <ClueList puzzle={puzzle} xw={xw} />
      </div>

      {/* Mobile only: clue bar + keyboard, stuck to the bottom of the viewport
          while the rest of the page scrolls. */}
      <div className="mobile-bar" onPointerDown={resume}>
        <ClueBanner xw={xw} />
        <MobileKeyboard xw={xw} />
      </div>

      {showModal && (
        <CompletionModal
          elapsed={elapsed}
          usedReveal={xw.revealed.size > 0}
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
                setShowReset(false);
              }}
            >
              Reset
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
