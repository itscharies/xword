import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./Logo.tsx";
import { Modal } from "./Modal.tsx";
import { InfoIcon } from "./icons.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";
import {
  DEFAULT_SIZE,
  SHIKAKU_SIZES,
  checkBoard,
  clearShikakuProgress,
  dailySeed,
  generateShikaku,
  isDailySeed,
  listShikakuProgress,
  loadShikakuProgress,
  makeShikakuId,
  normRect,
  parseShikakuId,
  placeRect,
  randomSeed,
  rectAt,
  saveShikakuProgress,
  type Rect,
  type ShikakuPuzzle,
} from "../lib/shikaku.ts";

const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---- landing page: /shikaku ---------------------------------------------

export function ShikakuHome({
  onOpenArchive,
  onNavigate,
}: {
  onOpenArchive: () => void;
  onNavigate: (route: string) => void;
}) {
  useDocumentTitle("Shikaku — The Daily Grid");
  const today = dailySeed();
  const saved = useMemo(() => listShikakuProgress(), []);
  const inProgress = saved.filter((s) => !s.progress.solved && s.progress.rects.length > 0);
  const dailyState = (size: number) => saved.find((s) => s.id === makeShikakuId(size, today))?.progress;

  return (
    <div className="app shikaku-page">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>Shikaku</h1>
          </div>
        </div>
      </header>

      <div className="shk-home">
        <p className="shk-intro">
          Divide the grid into rectangles. Every rectangle holds exactly one
          number, and that number is its area. Drag from one corner to the
          opposite corner to draw a box; tap a box to remove it.
        </p>

        <section>
          <h3 className="shk-section-head">Today’s puzzles</h3>
          <div className="toolbar">
            {SHIKAKU_SIZES.map((n) => {
              const p = dailyState(n);
              return (
                <button
                  key={n}
                  className={`btn${p?.solved ? " active" : ""}`}
                  onClick={() => onNavigate(`shikaku/${makeShikakuId(n, today)}`)}
                >
                  {n}×{n}
                  {p?.solved ? " ✓" : p && p.rects.length > 0 ? " …" : ""}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="shk-section-head">Random puzzle</h3>
          <div className="toolbar">
            {SHIKAKU_SIZES.map((n) => (
              <button
                key={n}
                className="btn"
                onClick={() => onNavigate(`shikaku/${makeShikakuId(n, randomSeed())}`)}
              >
                New {n}×{n}
              </button>
            ))}
          </div>
        </section>

        {inProgress.length > 0 && (
          <section>
            <h3 className="shk-section-head">Continue</h3>
            <div className="toolbar">
              {inProgress.slice(0, 8).map((s) => (
                <button key={s.id} className="btn" onClick={() => onNavigate(`shikaku/${s.id}`)}>
                  {labelFor(s.id)} · {fmtTime(s.progress.elapsed)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function labelFor(id: string): string {
  const p = parseShikakuId(id);
  if (!p) return id;
  return `${p.size}×${p.size}${isDailySeed(p.seed) ? ` · ${p.seed.slice(7, 9)}/${p.seed.slice(5, 7)}` : ""}`;
}

// ---- play page: /shikaku/<id> -------------------------------------------

interface Cell {
  r: number;
  c: number;
}

export function ShikakuPlay({
  id,
  onOpenArchive,
  onNavigate,
}: {
  id: string;
  onOpenArchive: () => void;
  onNavigate: (route: string) => void;
}) {
  const puzzle = useMemo(() => generateShikaku(id), [id]);
  const sizeLabel = puzzle ? `${puzzle.size}×${puzzle.size}` : "";
  useDocumentTitle(puzzle ? `Shikaku ${sizeLabel} — The Daily Grid` : "Shikaku — The Daily Grid");

  if (!puzzle) {
    return (
      <div className="app shikaku-page">
        <header className="header">
          <div className="header-left">
            <Logo onClick={onOpenArchive} />
            <div className="title-block">
              <h1>Shikaku</h1>
            </div>
          </div>
        </header>
        <div className="archive-empty">
          <p>That isn’t a Shikaku puzzle id.</p>
          <button className="btn" onClick={() => onNavigate("shikaku")}>
            Pick a puzzle
          </button>
        </div>
      </div>
    );
  }
  return (
    <Board key={id} puzzle={puzzle} onOpenArchive={onOpenArchive} onNavigate={onNavigate} />
  );
}

function Board({
  puzzle,
  onOpenArchive,
  onNavigate,
}: {
  puzzle: ShikakuPuzzle;
  onOpenArchive: () => void;
  onNavigate: (route: string) => void;
}) {
  const { size, id } = puzzle;
  const seed = parseShikakuId(id)?.seed ?? "";

  const initial = useMemo(() => loadShikakuProgress(id), [id]);
  const [rects, setRects] = useState<Rect[]>(initial?.rects ?? []);
  const [history, setHistory] = useState<Rect[][]>([]);
  const [elapsed, setElapsed] = useState(initial?.elapsed ?? 0);
  const [showHelp, setShowHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const status = useMemo(() => checkBoard(puzzle, rects), [puzzle, rects]);
  const solved = status.solved;

  // Timer: ticks while unsolved and the tab is visible.
  useEffect(() => {
    if (solved) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") setElapsed((e) => e + (now - last) / 1000);
      last = now;
    }, 1000);
    return () => clearInterval(t);
  }, [solved]);

  // Persist on every board change (and once a second for the clock). An
  // untouched board isn't saved, but once anything has been, an emptied
  // board is too — otherwise "Continue" would resurrect removed boxes.
  const everSaved = useRef(!!initial);
  useEffect(() => {
    if (rects.length === 0 && !everSaved.current) return;
    everSaved.current = true;
    saveShikakuProgress(id, { rects, elapsed, solved, updatedAt: Date.now() });
  }, [id, rects, elapsed, solved]);

  const commit = useCallback((next: Rect[]) => {
    setHistory((h) => [...h.slice(-50), rects]);
    setRects(next);
  }, [rects]);

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setRects(prev);
  };

  const reset = () => {
    commit([]);
    setElapsed(0);
    setDismissed(false);
    clearShikakuProgress(id);
  };

  const newPuzzle = () => onNavigate(`shikaku/${makeShikakuId(size, randomSeed())}`);

  // ---- drag-to-draw --------------------------------------------------------
  // Raw touch events (not pointer events) so it behaves on iPhone Safari —
  // the archive swipe does the same. touch-action: none on the board stops
  // the page from scrolling under a drag. The mouse path mirrors it so the
  // desktop can be used for testing.
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ anchor: Cell; cur: Cell; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);
  const rectsRef = useRef(rects);
  rectsRef.current = rects;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const cellAt = useCallback(
    (x: number, y: number): Cell | null => {
      const el = boardRef.current;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const c = Math.floor(((x - b.left) / b.width) * size);
      const r = Math.floor(((y - b.top) / b.height) * size);
      return {
        r: Math.max(0, Math.min(size - 1, r)),
        c: Math.max(0, Math.min(size - 1, c)),
      };
    },
    [size],
  );

  const begin = useCallback(
    (x: number, y: number) => {
      const cell = cellAt(x, y);
      if (!cell) return;
      dragRef.current = { anchor: cell, cur: cell, moved: false };
      setPreview(normRect(cell, cell));
    },
    [cellAt],
  );

  const move = useCallback(
    (x: number, y: number) => {
      const d = dragRef.current;
      if (!d) return;
      const cell = cellAt(x, y);
      if (!cell || (cell.r === d.cur.r && cell.c === d.cur.c)) return;
      d.cur = cell;
      if (cell.r !== d.anchor.r || cell.c !== d.anchor.c) d.moved = true;
      setPreview(normRect(d.anchor, cell));
    },
    [cellAt],
  );

  const end = useCallback(
    (cancel = false) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPreview(null);
      if (!d || cancel) return;
      const current = rectsRef.current;
      if (!d.moved) {
        // A tap: lift an existing box, or drop a 1×1 on a "1" clue.
        const i = rectAt(current, d.anchor.r, d.anchor.c);
        if (i >= 0) {
          commitRef.current(current.filter((_, j) => j !== i));
        } else if (puzzle.clues.some((q) => q.r === d.anchor.r && q.c === d.anchor.c && q.n === 1)) {
          commitRef.current(placeRect(current, normRect(d.anchor, d.anchor)));
        }
        return;
      }
      commitRef.current(placeRect(current, normRect(d.anchor, d.cur)));
    },
    [puzzle],
  );

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        end(true);
        return;
      }
      e.preventDefault();
      const t = e.touches[0];
      begin(t.clientX, t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    };
    const onEnd = (e: TouchEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      end();
    };
    const onCancel = () => end(true);
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [begin, move, end]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    begin(e.clientX, e.clientY);
    const onMM = (ev: MouseEvent) => move(ev.clientX, ev.clientY);
    const onMU = () => {
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", onMU);
      end();
    };
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
  };

  // ---- render -----------------------------------------------------------
  const pct = (n: number) => `${(n / size) * 100}%`;
  const rectStyle = (x: Rect) => ({
    left: pct(x.c0),
    top: pct(x.r0),
    width: pct(x.c1 - x.c0 + 1),
    height: pct(x.r1 - x.r0 + 1),
  });
  const clueByCell = useMemo(() => {
    const m = new Map<number, number>();
    for (const q of puzzle.clues) m.set(q.r * size + q.c, q.n);
    return m;
  }, [puzzle, size]);
  const previewArea = preview ? (preview.r1 - preview.r0 + 1) * (preview.c1 - preview.c0 + 1) : 0;

  return (
    <div className="app shikaku-page">
      <header className="header">
        <div className="header-left">
          <Logo onClick={onOpenArchive} />
          <div className="title-block">
            <h1>
              Shikaku {size}×{size}
              {isDailySeed(seed) ? " · Daily" : ""}
            </h1>
          </div>
        </div>
        <div className="header-right">
          <div className={`timer${solved ? " paused" : ""}`} aria-label="Time">
            {fmtTime(elapsed)}
          </div>
          <button
            className="btn icon-btn cog-btn"
            onClick={() => setShowHelp(true)}
            aria-label="How to play"
            title="How to play"
          >
            <InfoIcon />
          </button>
        </div>
      </header>

      <div className={`shk-wrap${solved ? " is-solved" : ""}`} data-size={size}>
        <div
          ref={boardRef}
          className="shk-board"
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
          onMouseDown={onMouseDown}
          onContextMenu={(e) => e.preventDefault()}
          role="application"
          aria-label={`Shikaku board, ${size} by ${size}`}
        >
          {Array.from({ length: size * size }, (_, i) => {
            const n = clueByCell.get(i);
            return (
              <div key={i} className={`shk-cell${n !== undefined ? " has-clue" : ""}`}>
                {n !== undefined ? n : ""}
              </div>
            );
          })}
          {status.rects.map((s, i) => (
            <div
              key={i}
              className={`shk-rect${s.valid ? " is-ok" : " is-bad"}`}
              style={rectStyle(s.rect)}
            />
          ))}
          {preview && (
            <div className="shk-rect is-preview" style={rectStyle(preview)}>
              <span className="shk-preview-area">{previewArea}</span>
            </div>
          )}
        </div>
      </div>

      <div className="shk-status">
        {solved ? (
          <b>Solved!</b>
        ) : (
          <>
            {status.covered}/{status.total} cells · {rects.length} boxes
            {status.rects.some((s) => !s.valid) ? " · some boxes are wrong" : ""}
          </>
        )}
      </div>

      <div className="toolbar shk-actions">
        <button className="btn" onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
        <button className="btn" onClick={reset} disabled={rects.length === 0}>
          Clear
        </button>
        <button className="btn" onClick={newPuzzle}>
          New {size}×{size}
        </button>
        <button className="btn" onClick={() => onNavigate("shikaku")}>
          All sizes
        </button>
      </div>

      {solved && !dismissed && (
        <Modal title="Solved!" onClose={() => setDismissed(true)}>
          <div className="big-time">{fmtTime(elapsed)}</div>
          <p>
            {size}×{size}
            {isDailySeed(seed) ? " daily" : ""} · {rects.length} rectangles
          </p>
          <div className="modal-actions">
            <button className="btn btn-accent" onClick={newPuzzle}>
              New {size}×{size}
            </button>
            <button className="btn" onClick={() => onNavigate("shikaku")}>
              All sizes
            </button>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal title="How to play Shikaku" onClose={() => setShowHelp(false)}>
          <div className="howto">
            <section>
              <p>
                Divide the whole grid into rectangles so that each rectangle
                contains exactly one number, and that number equals the
                rectangle’s area (width × height).
              </p>
            </section>
            <section>
              <h3>Controls</h3>
              <ul>
                <li>
                  <b>Drag</b> from one corner of a rectangle to the opposite
                  corner to draw it. The number in the preview is its area.
                </li>
                <li>
                  <b>Tap</b> a rectangle to remove it. Drawing over existing
                  rectangles replaces them.
                </li>
                <li>Tap a lone <b>1</b> to box it in.</li>
                <li>
                  A <b>red</b> rectangle breaks a rule — wrong area, no number,
                  or two numbers. Accent-tinted rectangles are fine.
                </li>
              </ul>
            </section>
            <section>
              <p className="howto-dim">
                Your progress is saved on this device. The daily puzzles are
                the same for everyone on a given day; the rest are random.
              </p>
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { DEFAULT_SIZE as SHIKAKU_DEFAULT_SIZE };
