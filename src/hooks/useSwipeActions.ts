import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TransitionEvent as ReactTransitionEvent,
} from "react";

/** Touch devices as CSS sees them — the same query index.css uses to hide the
 *  hover-revealed download toggle, so the icon and the swipe swap in step. */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  /** Shown but inert: the tile only budges a little so the label can explain
   *  why; release never commits. */
  disabled?: boolean;
  onCommit: () => void;
}

export type SwipePhase = "idle" | "drag" | "commit" | "return";
/** The direction the finger moves; the panel is revealed on the opposite edge. */
export type SwipeDir = "left" | "right";

// Movement (px) before a press is a horizontal swipe (needs |dx| > |dy|) or
// handed back to the browser as a scroll…
const INTENT_PX = 10;
// …except a clearly sideways start (|dx| > 2|dy|) locks in sooner, to beat
// WebKit's own vertical-scroll recognizer to the touch (see onTouchMove).
const INTENT_FAST_PX = 6;
// How far the face follows the finger before it sticks, and the distance that
// arms the action: exactly the panel's label column, so the face stops flush
// with the label's edge — must match .swipe-panel-body { width } in index.css.
const REVEAL_PX = 96;
// Past the clamp the face gives a little more, rubber-band style: at most this
// many px, reached only when the finger hits the far edge of the screen…
const STRETCH_MAX_PX = 20;
// …with the give decaying exponentially on the way there (higher = stiffer
// sooner). See stretch().
const STRETCH_DECAY = 4;
// A disabled side only peeks: this ratio of the finger, capped at DISABLED_PEEK_PX.
const DISABLED_FOLLOW = 0.35;
const DISABLED_PEEK_PX = 56;
// Face parked at REVEAL_PX, armed look kept, while the action lands.
const COMMIT_HOLD_MS = 140;
// Snap-back / return (ease-out) — must match .swipe-tile[data-phase="return"] in index.css.
const RETURN_MS = 250;
// Slack past the CSS duration before the timer stands in for a transitionend
// that never arrived (e.g. the face was already where it was told to go).
const TRANSITION_SLACK_MS = 80;
// A finger that has rested this long without committing to a swipe or a
// scroll is a press: only then does the tile take its pressed look, and it
// drops the moment the gesture becomes either. (UIKit's delaysContentTouches.)
const PRESS_DELAY_MS = 60;

type Lock = "none" | "h" | "dead";

/** Extra px the face moves for `over` px of finger travel past the clamp,
 *  given `room` px between the clamp point and the screen edge. Its rate
 *  starts near half the finger's and decays exponentially, reaching exactly
 *  zero at the edge — so dragging to the far side of the screen adds
 *  STRETCH_MAX_PX and not a pixel more:
 *
 *    f(t) = MAX · [(1 − e^(−kt)) − kt·e^(−k)] / [1 − e^(−k) − k·e^(−k)],  t = over/room
 *
 *  f(0) = 0, f(1) = MAX, f'(1) = 0 (the −kt·e^(−k) term cancels the
 *  exponential's leftover slope at t = 1). */
function stretch(over: number, room: number): number {
  if (over <= 0 || room <= 0) return 0;
  const t = Math.min(over / room, 1);
  const k = STRETCH_DECAY;
  const tail = Math.exp(-k);
  return (STRETCH_MAX_PX * (1 - Math.exp(-k * t) - k * t * tail)) / (1 - tail - k * tail);
}

/** The iOS Mail row gesture for a list tile: the face follows the finger
 *  sideways over an action panel, 1:1 up to REVEAL_PX (the panel's label
 *  column) and then only rubber-bands a few px further (STRETCH_MAX_PX at the
 *  screen edge), so the reveal barely runs past the label. Reaching that point arms the action — the
 *  panel turns from grey to the accent and its label zooms (CSS on
 *  `data-armed`) — and pulling back un-arms it. Release while armed commits:
 *  the face holds where it is, armed look intact, while onCommit lands, then
 *  eases home; release short of it snaps back. Vertical scrolling is never
 *  hijacked — the root needs `touch-action: pan-y` and the gesture only locks
 *  in once a drag is clearly horizontal. The hot path (move) writes the
 *  transform imperatively and touches React state only on direction/armed
 *  changes.
 *
 *  Two input paths feed one gesture core:
 *
 *  - Fingers come in through native touch listeners (attached by the callback
 *    `rootRef`), not Pointer Events. iOS honours `touch-action: pan-y` only
 *    loosely: a few px of vertical drift during a horizontal pan starts a
 *    vertical scroll and the page gets `pointercancel` — bugs.webkit.org
 *    #203335 — so a Pointer Events swipe works in Chrome's device emulation
 *    (strict axis lock) and dies on a real iPhone. Only a non-passive
 *    `touchmove` that calls preventDefault() keeps WebKit's scroll recogniser
 *    off the touch, and React registers its touch handlers passive, hence the
 *    hand-rolled listeners.
 *  - Mice and pens use Pointer Events on the root; touch-type pointers are
 *    ignored there so a finger is never handled twice.
 *
 *  Press feedback is JS-driven too (`pressed` → `data-pressed`): WebKit lands
 *  `:active` on touch start, which made every swipe open with the tile
 *  sitting down and the card flashing accent before the slide began. */
export function useSwipeActions({ swipeLeft, swipeRight }: { swipeLeft: SwipeAction; swipeRight: SwipeAction }): {
  /** Callback ref (not a RefObject): attaching the non-passive touch
   *  listeners has to follow the node, which only exists while the tile is
   *  in swipe mode. */
  rootRef: (node: HTMLLIElement | null) => void;
  faceRef: RefObject<HTMLDivElement>;
  phase: SwipePhase;
  armed: boolean;
  /** A resting press, for the tile's pressed look — never during a swipe. */
  pressed: boolean;
  /** The panel to render behind the face, or null when nothing is revealed.
   *  Frozen at commit so the label can't flip during the hold and return. */
  panel: { dir: SwipeDir; action: SwipeAction } | null;
  rootProps: {
    onPointerDown: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onLostPointerCapture: (e: ReactPointerEvent<HTMLLIElement>) => void;
    onClickCapture: (e: ReactMouseEvent<HTMLLIElement>) => void;
    onContextMenu: (e: ReactMouseEvent<HTMLLIElement>) => void;
  };
  faceProps: { onTransitionEnd: (e: ReactTransitionEvent<HTMLDivElement>) => void };
} {
  const rootEl = useRef<HTMLLIElement | null>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<SwipePhase>("idle");
  const [armed, setArmedState] = useState(false);
  const [pressedUi, setPressedState] = useState(false);
  const [panel, setPanelState] = useState<{ dir: SwipeDir; action: SwipeAction } | null>(null);

  const pressed = useRef(false);
  const locked = useRef<Lock>("none");
  const startX = useRef(0);
  const startY = useRef(0);
  // The mouse/pen pointer, or the finger, the current gesture belongs to.
  const pointerId = useRef(-1);
  const touchId = useRef(-1);
  const offset = useRef(0);
  // Direction the panel currently shows, null while nothing is revealed, and
  // the action it was rendered from — compared by the fields the panel shows,
  // since the action objects are rebuilt every render.
  const shownDir = useRef<SwipeDir | null>(null);
  const shownAction = useRef<SwipeAction | null>(null);
  const armedRef = useRef(false);
  // Set once a press has become a drag so the click the browser may still
  // synthesise on release is swallowed rather than opening the puzzle.
  const swipedRef = useRef(false);
  const timers = useRef<number[]>([]);
  const pressTimer = useRef(0);
  const phaseRef = useRef<SwipePhase>("idle");
  const alive = useRef(true);
  const pendingEnd = useRef<(() => void) | null>(null);
  // The actions are rebuilt every render (their labels flip after a commit),
  // so the gesture core reads the latest through a ref rather than closing
  // over one render's copy.
  const actions = useRef({ swipeLeft, swipeRight });
  actions.current = { swipeLeft, swipeRight };

  const setPhase = (p: SwipePhase) => {
    phaseRef.current = p;
    if (alive.current) setPhaseState(p);
  };
  const setArmed = (a: boolean) => {
    armedRef.current = a;
    if (alive.current) setArmedState(a);
  };
  const setPressed = (p: boolean) => {
    if (alive.current) setPressedState(p);
  };
  const setPanel = (p: { dir: SwipeDir; action: SwipeAction } | null) => {
    shownDir.current = p?.dir ?? null;
    shownAction.current = p?.action ?? null;
    if (alive.current) setPanelState(p);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = 0;
    }
    setPressed(false);
  };
  const moveFace = (px: number) => {
    offset.current = px;
    const face = faceRef.current;
    if (face) face.style.transform = `translate3d(${px}px,0,0)`;
  };

  // Run cb when the face's transform transition ends, or after the CSS
  // duration plus slack if transitionend never arrives — whichever is first.
  const afterTransition = (ms: number, cb: () => void) => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      pendingEnd.current = null;
      cb();
    };
    pendingEnd.current = run;
    timers.current.push(window.setTimeout(run, ms + TRANSITION_SLACK_MS));
  };

  const finish = () => {
    clearTimers();
    pendingEnd.current = null;
    offset.current = 0;
    const face = faceRef.current;
    if (face) face.style.transform = "";
    setArmed(false);
    setPanel(null);
    setPhase("idle");
  };

  const returnHome = () => {
    setPhase("return");
    // Already home (nothing moved before a cancel): no transitionend will fire.
    if (offset.current === 0 || !faceRef.current) {
      finish();
      return;
    }
    moveFace(0);
    afterTransition(RETURN_MS, finish);
  };

  const commit = (dir: SwipeDir) => {
    setPhase("commit");
    // The face settles from any rubber-band stretch back to the reveal
    // distance (the commit rule carries the return's ease, so it springs
    // rather than jumps) and holds there; a plain timer paces the hold.
    // `armed` is left true through it so the accent and the label zoom
    // don't flicker.
    moveFace(dir === "left" ? -REVEAL_PX : REVEAL_PX);
    // Firing onCommit while the face is parked means the badge/label change
    // is already rendered when the card comes back; `panel` stays frozen so
    // the label can't flip during the hold.
    const action = dir === "left" ? actions.current.swipeLeft : actions.current.swipeRight;
    action.onCommit();
    timers.current.push(window.setTimeout(returnHome, COMMIT_HOLD_MS));
  };

  // ---- gesture core — refs only, shared by both input paths ---------------

  /** True when this press may start a gesture; false mid-animation, where a
   *  tap must never open a puzzle whose state is changing. */
  const begin = (x: number, y: number): boolean => {
    if (phaseRef.current !== "idle") {
      swipedRef.current = true;
      return false;
    }
    swipedRef.current = false;
    pressed.current = true;
    locked.current = "none";
    startX.current = x;
    startY.current = y;
    offset.current = 0;
    armedRef.current = false;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = 0;
      if (pressed.current && locked.current === "none") setPressed(true);
    }, PRESS_DELAY_MS);
    return true;
  };

  /** Feeds one sample; returns the lock it left the gesture in. */
  const move = (x: number, y: number): Lock => {
    const dx = x - startX.current;
    const dy = y - startY.current;
    const mag = Math.abs(dx);
    const ady = Math.abs(dy);
    if (locked.current === "none") {
      if ((mag > INTENT_PX && mag > ady) || (mag > INTENT_FAST_PX && mag > 2 * ady)) {
        locked.current = "h";
        swipedRef.current = true;
        clearPress();
        setPhase("drag");
      } else if (ady > INTENT_PX) {
        // A scroll: pan-y hands it to the browser, which will usually cancel
        // us. Ambiguous jitter below INTENT_PX stays a tap.
        locked.current = "dead";
        pressed.current = false;
        clearPress();
        return "dead";
      } else return "none";
    }
    const dir: SwipeDir = dx < 0 ? "left" : "right";
    const action = dir === "left" ? actions.current.swipeLeft : actions.current.swipeRight;
    const live = !action.disabled;
    const sign = dx < 0 ? -1 : 1;
    // 1:1 under the finger like Mail until the label column is uncovered,
    // then all but stuck there: overshoot only stretches the face a little
    // further, dying away to nothing by the screen edge, so it reads as
    // resistance, not a longer slide. An inert side only budges enough for
    // its label to explain why.
    if (live) {
      const clampAt = startX.current + sign * REVEAL_PX;
      const room = sign > 0 ? window.innerWidth - clampAt : clampAt;
      moveFace(sign * (Math.min(mag, REVEAL_PX) + stretch(mag - REVEAL_PX, room)));
    } else {
      moveFace(sign * Math.min(mag * DISABLED_FOLLOW, DISABLED_PEEK_PX));
    }
    // Re-render the panel on a direction change, and when the live action no
    // longer matches what it shows — e.g. "Remove download" finishing mid-drag
    // and the side becoming a live "Save offline": `live` above already
    // follows the new action, so the label and grey must follow too, or the
    // tile could arm and commit under the opposite label.
    if (
      shownDir.current !== dir ||
      shownAction.current?.label !== action.label ||
      shownAction.current?.disabled !== action.disabled
    )
      setPanel({ dir, action });
    // Armed exactly when the face has hit its stop; easing back un-arms.
    const nowArmed = live && mag >= REVEAL_PX;
    if (nowArmed !== armedRef.current) {
      setArmed(nowArmed);
      if (nowArmed) navigator.vibrate?.(10);
    }
    return "h";
  };

  const release = (cancel: boolean) => {
    clearPress();
    if (!pressed.current) return;
    pressed.current = false;
    // A tap: the click proceeds to the card's onPress as before.
    if (locked.current !== "h") return;
    locked.current = "none";
    const dir = shownDir.current;
    if (!cancel && armedRef.current && dir) commit(dir);
    else returnHome();
  };

  // ---- pointer path: mouse and pen only -----------------------------------

  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "touch" || pressed.current) return;
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    // No capture yet: capturing on down would retarget a plain tap's click to
    // the li and the card's onClick would never see it.
    if (begin(e.clientX, e.clientY)) pointerId.current = e.pointerId;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "touch" || !pressed.current || e.pointerId !== pointerId.current) return;
    const wasLocked = locked.current === "h";
    if (move(e.clientX, e.clientY) === "h" && !wasLocked) {
      try {
        rootEl.current?.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic / unsupported pointers */
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerType !== "touch" && e.pointerId === pointerId.current) release(false);
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerType !== "touch" && e.pointerId === pointerId.current) release(true);
  };
  // Safety net only: capture normally ends through pointerup/cancel above.
  const onLostPointerCapture = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "touch" || e.pointerId !== pointerId.current) return;
    if (pressed.current && locked.current === "h") {
      pressed.current = false;
      locked.current = "none";
      clearPress();
      returnHome();
    }
  };

  // ---- touch path -----------------------------------------------------------

  const ownTouch = (e: TouchEvent): Touch | null => {
    const list = e.changedTouches;
    for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId.current) return list[i];
    return null;
  };

  const onTouchStart = (e: TouchEvent) => {
    // A second finger, or a mouse gesture already in flight: not ours.
    if (touchId.current !== -1 || pressed.current) return;
    const t = e.changedTouches[0];
    if (t && begin(t.clientX, t.clientY)) touchId.current = t.identifier;
  };

  const onTouchMove = (e: TouchEvent) => {
    const t = ownTouch(e);
    if (!t || !pressed.current) return;
    // Once the drag is ours, take the touch away from the browser. Until
    // then every sample passes through, so a scroll that starts on a tile
    // begins exactly as it would anywhere else — WebKit treats the first
    // preventDefault() as binding for the whole touch sequence, so
    // preventing while still ambiguous would silently eat vertical scrolls.
    if (move(t.clientX, t.clientY) === "h" && e.cancelable) e.preventDefault();
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!ownTouch(e)) return;
    touchId.current = -1;
    release(false);
  };
  const onTouchCancel = (e: TouchEvent) => {
    if (!ownTouch(e)) return;
    touchId.current = -1;
    release(true);
  };

  // The native listeners are bound once per node and dispatch through this
  // ref, so they always run the current render's closures.
  const touch = useRef({ start: onTouchStart, move: onTouchMove, end: onTouchEnd, cancel: onTouchCancel });
  touch.current = { start: onTouchStart, move: onTouchMove, end: onTouchEnd, cancel: onTouchCancel };

  const detach = useRef<(() => void) | null>(null);
  const rootRef = useCallback((node: HTMLLIElement | null) => {
    detach.current?.();
    detach.current = null;
    rootEl.current = node;
    if (!node) return;
    const start = (e: TouchEvent) => touch.current.start(e);
    const move = (e: TouchEvent) => touch.current.move(e);
    const end = (e: TouchEvent) => touch.current.end(e);
    const cancel = (e: TouchEvent) => touch.current.cancel(e);
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", move, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", cancel);
    detach.current = () => {
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", move);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", cancel);
    };
  }, []);

  // ---- shared DOM hooks ------------------------------------------------------

  // Runs before the card's onClick and MutualStack's own onClick, whichever
  // element the browser targets the post-drag click at. iOS fires no click
  // after a drag; the flag is reset on the next accepted press so a
  // following tap is never swallowed. Keyboard Enter/Space is untouched.
  const onClickCapture = (e: ReactMouseEvent<HTMLLIElement>) => {
    if (!swipedRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    swipedRef.current = false;
  };
  // Android's long-press menu during a slow drag.
  const onContextMenu = (e: ReactMouseEvent<HTMLLIElement>) => {
    if (phaseRef.current !== "idle") e.preventDefault();
  };
  const onTransitionEnd = (e: ReactTransitionEvent<HTMLDivElement>) => {
    if (e.target !== faceRef.current || e.propertyName !== "transform") return;
    pendingEnd.current?.();
  };

  useEffect(() => {
    alive.current = true;
    // Backgrounded mid-gesture (app switch, tab hide): the pointer is gone
    // and timers are throttled, so put everything back rather than resume.
    // Nothing is lost by cutting a commit's hold short: its onCommit has
    // already run, synchronously, at the start of the commit phase.
    const onHide = () => {
      if (document.visibilityState !== "hidden" || phaseRef.current === "idle") return;
      pressed.current = false;
      locked.current = "none";
      touchId.current = -1;
      try {
        rootEl.current?.releasePointerCapture(pointerId.current);
      } catch {
        /* not captured */
      }
      clearPress();
      finish();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onHide);
      timers.current.forEach(clearTimeout);
      clearTimeout(pressTimer.current);
    };
    // finish() touches only refs and stable setters, so the first render's
    // closure is as good as any.
  }, []);

  return {
    rootRef,
    faceRef,
    phase,
    armed,
    pressed: pressedUi,
    panel,
    rootProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onClickCapture,
      onContextMenu,
    },
    faceProps: { onTransitionEnd },
  };
}
