import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from "react";
import type { Puzzle } from "../types.ts";
import type { Crossword } from "../hooks/useCrossword.ts";
import { cursorClue, type RemoteCursor } from "../hooks/useSession.ts";
import { Grid } from "./Grid.tsx";

/** Breathing room (px) between the grid and the viewport edge whenever the
 *  grid is at rest — every side, both at the fit (minimum) scale and at the
 *  pan limits when zoomed in, where the grid edge settles this far inside
 *  the viewport instead of flush against it. Mid-pan the content still
 *  clips at the true edges (the toolbar, keyboard and screen sides — the
 *  mobile layout collapses its solve-body gap for exactly that; see
 *  index.css). */
const FIT_PAD = 12;
/** Gap (px) kept between a panned-to word and the viewport edge, so landing
 *  on a word never leaves it looking cut off at a side. */
const WORD_PAD = 24;
/** Pointer travel (px) before a press counts as a pan instead of a tap. */
const DRAG_PX = 6;
/** Longest side of the minimap (px). */
const MINIMAP_SIZE = 72;
/** How long the minimap lingers after the last pan or zoom. */
const MINIMAP_HIDE_MS = 450;
/** Zoom speed for ctrl/cmd+wheel (and trackpad pinch, which browsers report
 *  as ctrl+wheel): scale multiplies by e^(-delta * this). */
const WHEEL_ZOOM = 0.005;

const EASE = "0.22s cubic-bezier(0.2, 0.8, 0.3, 1)";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The pan delta that brings [lo, hi] fully inside [containerLo, containerHi]
 *  (as a scroll-style delta: subtract it from the translation). Falls back to
 *  fitting just [activeLo, activeHi] — the caret cell — when the whole span
 *  is too big for the container at this zoom, so a long word still ends with
 *  the caret on screen rather than snapping to one end of the word. */
function fitAxis(
  lo: number,
  hi: number,
  containerLo: number,
  containerHi: number,
  activeLo: number,
  activeHi: number,
): number {
  const fitsWhole = hi - lo <= containerHi - containerLo;
  const [targetLo, targetHi] = fitsWhole ? [lo, hi] : [activeLo, activeHi];
  if (targetLo < containerLo) return targetLo - containerLo; // pan back
  if (targetHi > containerHi) return targetHi - containerHi; // pan forward
  return 0;
}

/** The canvas transform: screen = grid-space * s + (tx, ty). Grid space is
 *  the untransformed layout of .canvas-content, where cells sit at their full
 *  --min-cell size — so s = 1 is the old "fixed size" and doubles as the zoom
 *  ceiling, and the fit-in-viewport scale is the floor. */
interface View {
  s: number;
  tx: number;
  ty: number;
}

export function GridCanvas({
  puzzle,
  xw,
  remoteCursors,
}: {
  puzzle: Puzzle;
  xw: Crossword;
  remoteCursors?: RemoteCursor[];
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const minimapViewRef = useRef<HTMLDivElement | null>(null);

  // The transform lives in refs and is applied by direct style writes — a
  // React state round-trip per pointermove would re-render the whole grid
  // at gesture frequency for no reason.
  const view = useRef<View>({ s: 1, tx: 0, ty: 0 });
  const bounds = useRef({ minS: 0.05, maxS: 1 });
  const suppressClick = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);

  /** Small grids that would fit the viewport at *more* than full cell size
   *  get their layout upscaled (bigger cells) rather than transform-scaled,
   *  so a mini's text renders crisp instead of GPU-blurred. Scale then stays
   *  capped at 1 either way. Re-run whenever the viewport resizes. */
  const sizeGrid = () => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    const grid = content?.querySelector<HTMLElement>(".grid");
    if (!vp || !content || !grid) return;
    // Read the dimensions off the DOM (Grid sets --cols/--rows inline) so
    // this stays correct inside the ResizeObserver's long-lived closure.
    const cols = parseFloat(grid.style.getPropertyValue("--cols")) || 1;
    const rows = parseFloat(grid.style.getPropertyValue("--rows")) || 1;
    const shadow = content.offsetWidth - grid.offsetWidth;
    const minCell =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--min-cell")) || 42;
    const cellFit = Math.floor(
      Math.min(
        (vp.clientWidth - FIT_PAD * 2 - shadow) / cols,
        (vp.clientHeight - FIT_PAD * 2 - shadow) / rows,
      ),
    );
    if (cellFit > minCell) content.style.setProperty("--canvas-cell", `${cellFit}px`);
    else content.style.removeProperty("--canvas-cell");
  };

  /** Clamp a requested view to the legal range and write it to the DOM (the
   *  content layer and the minimap's viewport rectangle together). Zoomed-in
   *  axes clamp flush to the grid edge; axes where the grid is smaller than
   *  the viewport centre instead. */
  const apply = (next: View, animate = false) => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const gw = content.offsetWidth;
    const gh = content.offsetHeight;
    if (!vw || !vh || !gw || !gh) return;

    const minS = Math.max(
      0.05,
      Math.min((vw - FIT_PAD * 2) / gw, (vh - FIT_PAD * 2) / gh),
    );
    const maxS = Math.max(1, minS);
    bounds.current = { minS, maxS };

    const s = clamp(next.s, minS, maxS);
    const cw = gw * s;
    const ch = gh * s;
    // Pan limits keep FIT_PAD of background visible past the grid edge, so
    // panning to an extreme leaves the grid resting inset, not flush-cut.
    const tx = cw <= vw ? (vw - cw) / 2 : clamp(next.tx, vw - cw - FIT_PAD, FIT_PAD);
    const ty = ch <= vh ? (vh - ch) / 2 : clamp(next.ty, vh - ch - FIT_PAD, FIT_PAD);
    view.current = { s, tx, ty };

    content.style.transition = animate ? `transform ${EASE}` : "none";
    content.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;

    const mv = minimapViewRef.current;
    if (mv) {
      const lx = clamp(-tx / cw, 0, 1);
      const ly = clamp(-ty / ch, 0, 1);
      mv.style.transition = animate ? `all ${EASE}` : "none";
      mv.style.left = `${lx * 100}%`;
      mv.style.top = `${ly * 100}%`;
      mv.style.width = `${clamp(vw / cw, 0, 1 - lx) * 100}%`;
      mv.style.height = `${clamp(vh / ch, 0, 1 - ly) * 100}%`;
    }
  };

  /** Fade the minimap in, and back out MINIMAP_HIDE_MS after the last call. */
  const showMinimap = () => {
    const mm = minimapRef.current;
    if (!mm) return;
    mm.classList.add("show");
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => mm.classList.remove("show"),
      MINIMAP_HIDE_MS,
    );
  };

  /** On mobile the canvas layout pins .solve-body to one viewport height,
   *  but the page itself loads with the header above it — until that's
   *  scrolled away, .solve-body's bottom hangs below the fold and the
   *  sticky keyboard rides up over the bottom of the canvas, hiding the
   *  grid's last rows at full pan. The old scrolling board left that scroll
   *  to the solver; the canvas swallows every touch gesture, so it has to
   *  do it itself: called on mount and whenever panning starts. No-op once
   *  pinned, and on desktop (.solve-body is display: contents there, and
   *  the page never scrolls). */
  const scrollHeaderAway = () => {
    if (!matchMedia("(max-width: 820px)").matches) return;
    // The chat sheet freezes the page scroll (html.sc-locked) and, on iOS,
    // lays itself out against that frozen offset — scrollIntoView still moves
    // an overflow: hidden viewport, and moving it out from under the sheet
    // would both misplace the sheet and lose the solver's scroll position.
    // Nothing should reach here while the sheet is up (it covers the canvas,
    // and the grid's keydown handler is suspended by modalOpen), but this is
    // the only programmatic page scroll left in the app, so it says so.
    if (document.documentElement.classList.contains("sc-locked")) return;
    const body = viewportRef.current?.closest(".solve-body");
    if (body && body.getBoundingClientRect().top > 1) {
      body.scrollIntoView({ block: "start" });
    }
  };

  /** Where the content actually is right now — mid-animation this differs
   *  from view.current (which already holds the animation's target), so
   *  gestures read the computed transform to take over without a jump. */
  const settledView = (): View => {
    const content = contentRef.current;
    if (!content) return view.current;
    const t = getComputedStyle(content).transform;
    if (!t || t === "none") return view.current;
    const m = new DOMMatrixReadOnly(t);
    return { s: m.a || 1, tx: m.e, ty: m.f };
  };

  // Entry point: cells at full size (the old fixed mode's look), which the
  // word-pan effect below then centres on the active word.
  const didInit = useRef(false);
  useLayoutEffect(() => {
    didInit.current = false;
    scrollHeaderAway();
    sizeGrid();
    apply({ s: 1, tx: 0, ty: 0 });
  }, [puzzle]);

  // Keep the active word in view: when the caret moves (typing, arrows,
  // tapping a cell or clue, switching direction), pan the minimum needed to
  // fit the whole word with WORD_PAD of breathing room — or at least the
  // caret cell when the word doesn't fit at the current zoom. Runs after the
  // Grid child has re-rendered its .active/.word classes, so the DOM is
  // current. Zoom is left alone: only the translation moves.
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp || !content) return;
    const activeEl = content.querySelector<HTMLElement>(".cell.active");
    if (!activeEl) return;

    // offsetLeft/Top are relative to .canvas-content (the nearest positioned
    // ancestor) and ignore the transform — grid-space coordinates.
    const wordEls = content.querySelectorAll<HTMLElement>(".cell.active, .cell.word");
    let lo = { x: Infinity, y: Infinity };
    let hi = { x: -Infinity, y: -Infinity };
    wordEls.forEach((el) => {
      lo = { x: Math.min(lo.x, el.offsetLeft), y: Math.min(lo.y, el.offsetTop) };
      hi = {
        x: Math.max(hi.x, el.offsetLeft + el.offsetWidth),
        y: Math.max(hi.y, el.offsetTop + el.offsetHeight),
      };
    });

    const { s, tx, ty } = view.current;
    if (!didInit.current) {
      didInit.current = true;
      apply({
        s,
        tx: vp.clientWidth / 2 - ((lo.x + hi.x) / 2) * s,
        ty: vp.clientHeight / 2 - ((lo.y + hi.y) / 2) * s,
      });
      return;
    }

    const ax = activeEl.offsetLeft * s + tx;
    const ay = activeEl.offsetTop * s + ty;
    const dx = fitAxis(
      lo.x * s + tx, hi.x * s + tx,
      WORD_PAD, vp.clientWidth - WORD_PAD,
      ax, ax + activeEl.offsetWidth * s,
    );
    const dy = fitAxis(
      lo.y * s + ty, hi.y * s + ty,
      WORD_PAD, vp.clientHeight - WORD_PAD,
      ay, ay + activeEl.offsetHeight * s,
    );
    // No showMinimap() here, deliberately: the map is for orienting during
    // a hand-driven pan/zoom — flashing it on every caret-driven auto-pan
    // (typing across a word, tabbing through clues) is just noise.
    if (dx || dy) {
      scrollHeaderAway();
      apply({ s, tx: tx - dx, ty: ty - dy }, true);
    }
  }, [xw.active.row, xw.active.col, xw.direction]);

  // Gestures: drag to pan (mouse or single finger, past a tap threshold so
  // cell taps still select), pinch to zoom, wheel to pan, ctrl/cmd+wheel
  // (= trackpad pinch) to zoom around the cursor. All native listeners —
  // wheel needs passive: false to stop the page scrolling/zooming instead.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "idle" | "maybe" | "pan" | "pinch" = "idle";
    let start = { x: 0, y: 0 }; // pointerdown position, for the tap threshold
    let last = { x: 0, y: 0 }; // previous pan position
    let pinch0 = { d: 1, s: 1, wx: 0, wy: 0 }; // pinch anchor: start distance/scale + grid point under the midpoint

    const pos = (e: PointerEvent) => {
      const r = vp.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const midDist = () => {
      const [a, b] = [...pointers.values()];
      return {
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      };
    };

    const anchorPinch = () => {
      const { mx, my, d } = midDist();
      const { s, tx, ty } = view.current;
      pinch0 = { d, s, wx: (mx - tx) / s, wy: (my - ty) / s };
    };

    // Throws for a pointer that's already been released — a drag is still
    // fine without capture, just less robust at the viewport edge.
    const capture = (id: number) => {
      try {
        vp.setPointerCapture(id);
      } catch {
        /* ignore */
      }
    };

    // scrollHeaderAway moves the viewport under the fingers mid-gesture;
    // the stored positions are viewport-relative, so shift them along or
    // the first pan/pinch frame would jump by the scrolled distance.
    const pinPage = () => {
      const before = vp.getBoundingClientRect();
      scrollHeaderAway();
      const after = vp.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (dx || dy)
        pointers.forEach((p) => {
          p.x += dx;
          p.y += dy;
        });
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      suppressClick.current = false;
      pointers.set(e.pointerId, pos(e));
      // Freeze any in-flight word-pan animation where it currently is, so
      // the gesture takes over from there instead of the animation's target.
      apply(settledView());
      if (pointers.size === 1) {
        // Not a pan yet — and no pointer capture, or the browser would
        // retarget the eventual click away from the tapped cell.
        mode = "maybe";
        start = last = pos(e);
      } else if (pointers.size === 2) {
        mode = "pinch";
        for (const id of pointers.keys()) capture(id);
        pinPage();
        anchorPinch();
      }
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = pos(e);
      pointers.set(e.pointerId, p);
      if (mode === "maybe") {
        if (Math.hypot(p.x - start.x, p.y - start.y) > DRAG_PX) {
          mode = "pan";
          capture(e.pointerId);
          // Deferred to here (not pointerdown) so plain taps don't shift
          // the page — and the cell under the finger — before their click.
          pinPage();
          last = pos(e);
        }
      } else if (mode === "pan") {
        const { s, tx, ty } = view.current;
        apply({ s, tx: tx + (p.x - last.x), ty: ty + (p.y - last.y) });
        last = p;
        showMinimap();
      } else if (mode === "pinch") {
        const { mx, my, d } = midDist();
        const s2 = clamp(
          pinch0.s * (d / pinch0.d),
          bounds.current.minS,
          bounds.current.maxS,
        );
        // Keep the grid point that started under the pinch midpoint pinned
        // to the (moving) midpoint — zoom and pan in one step.
        apply({ s: s2, tx: mx - pinch0.wx * s2, ty: my - pinch0.wy * s2 });
        showMinimap();
      }
    };

    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      // A drag's pointerup is followed by a click on whatever cell the finger
      // ended over — swallow it (onClickCapture below) so panning never
      // selects a cell. Plain taps stay in "maybe" mode and click through.
      if (mode === "pan" || mode === "pinch") suppressClick.current = true;
      if (pointers.size >= 2) {
        anchorPinch(); // three fingers down to two: re-anchor the pinch
      } else if (pointers.size === 1) {
        mode = "pan"; // pinch down to one finger: keep panning seamlessly
        last = [...pointers.values()][0];
      } else {
        mode = "idle";
      }
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { s, tx, ty } = settledView();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines → ~px
        const s2 = clamp(
          s * Math.exp(-dy * WHEEL_ZOOM),
          bounds.current.minS,
          bounds.current.maxS,
        );
        // Zoom around the cursor: keep the grid point under it stationary.
        apply({ s: s2, tx: px - ((px - tx) / s) * s2, ty: py - ((py - ty) / s) * s2 });
      } else {
        apply({ s, tx: tx - e.deltaX, ty: ty - e.deltaY });
      }
      showMinimap();
    };

    // Re-clamp on viewport resizes (window resize, rotation, clue bar
    // growing) — the fit scale and the crisp-layout cell size both move
    // with the viewport.
    const ro = new ResizeObserver(() => {
      sizeGrid();
      apply(view.current);
    });
    ro.observe(vp);

    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move);
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", up);
    vp.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", up);
      vp.removeEventListener("wheel", wheel);
      window.clearTimeout(hideTimer.current);
    };
    // Everything is read live from refs, so the listeners never go stale.
  }, []);

  // Minimap tiles: the grid's block pattern, drawn once per puzzle in
  // grid-cell units (viewBox = cols × rows).
  const mapCells = useMemo(() => {
    const rects: ReactElement[] = [];
    puzzle.grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.void) return;
        rects.push(
          <rect
            key={`${r},${c}`}
            x={c}
            y={r}
            width={1}
            height={1}
            fill={cell.black ? "var(--cell-block)" : "var(--cell-bg)"}
          />,
        );
      }),
    );
    return rects;
  }, [puzzle]);

  // Other players on the minimap, drawn exactly like the local selection:
  // their selected word tinted in their accent, caret cell at full
  // strength. First peer claims a cell (no blending, matching the grid),
  // and the layer sits under the local word/caret so the local player
  // always renders on top.
  const mapPeers = useMemo(() => {
    if (!remoteCursors || remoteCursors.length === 0) return null;
    const claimed = new Set<string>();
    const rects: ReactElement[] = [];
    const push = (r: number, c: number, fill: string) => {
      const k = `${r},${c}`;
      if (claimed.has(k)) return;
      claimed.add(k);
      rects.push(<rect key={k} x={c} y={r} width={1} height={1} fill={fill} />);
    };
    for (const cur of remoteCursors) {
      push(cur.row, cur.col, cur.color);
      const clue = cursorClue(xw, cur);
      if (!clue) continue;
      for (let i = 0; i < clue.len; i++) {
        push(
          clue.direction === "down" ? clue.row + i : clue.row,
          clue.direction === "across" ? clue.col + i : clue.col,
          `color-mix(in srgb, ${cur.color} 55%, transparent)`,
        );
      }
    }
    return rects;
  }, [remoteCursors, xw.clueAt]);

  // The active word on the minimap, caret cell at full strength.
  const mapWord = useMemo(() => {
    const rects: ReactElement[] = [];
    for (const k of xw.highlighted) {
      const [r, c] = k.split(",").map(Number);
      rects.push(
        <rect key={k} x={c} y={r} width={1} height={1} fill="rgba(var(--hl-rgb), 0.55)" />,
      );
    }
    rects.push(
      <rect
        key="caret"
        x={xw.active.col}
        y={xw.active.row}
        width={1}
        height={1}
        fill="var(--hl)"
      />,
    );
    return rects;
  }, [xw.highlighted, xw.active]);

  const mapScale = MINIMAP_SIZE / Math.max(puzzle.width, puzzle.height);

  return (
    <div
      ref={viewportRef}
      className="grid-canvas"
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div ref={contentRef} className="canvas-content">
        <Grid puzzle={puzzle} xw={xw} remoteCursors={remoteCursors} />
      </div>
      <div
        ref={minimapRef}
        className="canvas-minimap"
        style={{
          width: puzzle.width * mapScale,
          height: puzzle.height * mapScale,
        }}
        aria-hidden
      >
        <svg
          viewBox={`0 0 ${puzzle.width} ${puzzle.height}`}
          preserveAspectRatio="none"
        >
          <g>{mapCells}</g>
          <g>{mapPeers}</g>
          <g>{mapWord}</g>
        </svg>
        <div ref={minimapViewRef} className="canvas-minimap-view" />
      </div>
    </div>
  );
}
