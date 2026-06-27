import { useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle, PuzzleIndexEntry } from "./types.ts";
import { useCrossword } from "./hooks/useCrossword.ts";
import { formatTime, useTimer } from "./hooks/useTimer.ts";
import {
  loadLastDate,
  loadProgress,
  loadZoomMode,
  saveLastDate,
  saveProgress,
  saveZoomMode,
} from "./lib/storage.ts";
import { Grid } from "./components/Grid.tsx";
import { ClueList } from "./components/ClueList.tsx";
import { ClueBanner } from "./components/ClueBanner.tsx";
import { Toolbar } from "./components/Toolbar.tsx";
import { PuzzlePicker } from "./components/PuzzlePicker.tsx";
import { MobileKeyboard } from "./components/MobileKeyboard.tsx";
import { CompletionModal } from "./components/CompletionModal.tsx";
import { ThemeControls } from "./components/ThemeControls.tsx";
import { Modal } from "./components/Modal.tsx";

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const [index, setIndex] = useState<PuzzleIndexEntry[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the puzzle index once.
  useEffect(() => {
    fetch(`${BASE}puzzles/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index.json ${r.status}`);
        return r.json() as Promise<PuzzleIndexEntry[]>;
      })
      .then((idx) => {
        setIndex(idx);
        const last = loadLastDate();
        const initial =
          last && idx.some((p) => p.date === last) ? last : idx[0]?.date ?? null;
        setDate(initial);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="error">Failed to load puzzles: {error}</div>;
  if (!index || !date) return <div className="loading">Loading…</div>;

  return (
    <PuzzleView
      key={date}
      date={date}
      index={index}
      onPickDate={(d) => {
        saveLastDate(d);
        setDate(d);
      }}
    />
  );
}

function PuzzleView({
  date,
  index,
  onPickDate,
}: {
  date: string;
  index: PuzzleIndexEntry[];
  onPickDate: (date: string) => void;
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
  return <Solver puzzle={puzzle} index={index} onPickDate={onPickDate} />;
}

function Solver({
  puzzle,
  index,
  onPickDate,
}: {
  puzzle: Puzzle;
  index: PuzzleIndexEntry[];
  onPickDate: (date: string) => void;
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

  // Fit (everything on one screen) vs scroll (whole page scrolls, only the
  // clue bar + keyboard stay pinned). Mobile only; remembered across sessions.
  const [scrollMode, setScrollMode] = useState(
    () => loadZoomMode() === "scroll",
  );

  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [celebrated, setCelebrated] = useState(saved?.completed ?? false);

  const modalOpen = showModal || showSettings || showReset;

  const barRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  // Track the pinned bottom bar's height so scroll-mode can pad the page by
  // exactly that much (so the last grid rows clear it).
  useEffect(() => {
    const bar = barRef.current;
    const app = appRef.current;
    if (!bar || !app) return;
    const update = () =>
      app.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

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

  const toggleScroll = () => {
    const next = !scrollMode;
    setScrollMode(next);
    saveZoomMode(next ? "scroll" : "fit");
  };

  return (
    <div className={`app ${scrollMode ? "scroll-mode" : "fit-mode"}`} ref={appRef}>
      <header className="header">
        <div className="title-block">
          <h1>{puzzle.title}</h1>
          <div className="byline">
            By {puzzle.author}
            {puzzle.editor ? ` · Edited by ${puzzle.editor}` : ""}
          </div>
        </div>
        <div className="header-right">
          <PuzzlePicker index={index} value={puzzle.date} onChange={onPickDate} />
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
            className={`btn icon-btn zoom-btn ${scrollMode ? "active" : ""}`}
            onClick={toggleScroll}
            aria-pressed={scrollMode}
            aria-label="Toggle fit / scroll"
            title={scrollMode ? "Fit to screen" : "Scroll mode"}
          >
            {scrollMode ? "⤡" : "⤢"}
          </button>
          <button
            className="btn cog-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <Toolbar xw={xw} onRequestReset={() => setShowReset(true)} />

      <div className="main" onPointerDown={resume}>
        <div className="board">
          {/* Banner above the grid on desktop; hidden on mobile (shown in the
              anchored bottom bar instead). */}
          <div className="banner-desktop">
            <ClueBanner xw={xw} />
          </div>
          <Grid puzzle={puzzle} xw={xw} />
        </div>
        <ClueList puzzle={puzzle} xw={xw} />
      </div>

      {/* Mobile only: clue bar + keyboard, pinned to the bottom of the viewport
          while the rest of the page scrolls. */}
      <div className="mobile-bar" ref={barRef} onPointerDown={resume}>
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
