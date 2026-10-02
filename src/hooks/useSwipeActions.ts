import {
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
  /** accent = do (accent-2 → accent when armed); neutral = undo (surface-2 →
   *  surface when armed). Default "accent". */
  tone?: "accent" | "neutral";
  /** Shown but inert: the tile only budges a little so the label can explain
   *  why; release never commits. */
  disabled?: boolean;
  onCommit: () => void;
}

export type SwipePhase = "idle" | "drag" | "commit" | "return";
/** The direction the finger moves; the panel is revealed on the opposite edge. */
export type SwipeDir = "left" | "right";

// Movement (px) before a press is a horizontal swipe (needs |dx| > |dy|) or
// handed back to the browser as a scroll.
const INTENT_PX = 10;
// Release past this fraction of the tile width commits…
const COMMIT_FRACTION = 0.4;
// …but never less than this.
const COMMIT_MIN_PX = 96;
// A disabled side only peeks: this ratio of the finger, capped at DISABLED_PEEK_PX.
const DISABLED_FOLLOW = 0.35;
const DISABLED_PEEK_PX = 56;
// Face slides fully out (ease-in) — must match .swipe-tile[data-phase="commit"] in index.css.
const COMMIT_OUT_MS = 200;
// Panel shown alone while the action lands.
const COMMIT_HOLD_MS = 120;
// Snap-back / return (ease-out) — must match .swipe-tile[data-phase="return"] in index.css.
const RETURN_MS = 250;
// Slack past the CSS duration before the timer stands in for a transitionend
// that never arrived (e.g. the face was already where it was told to go).
const TRANSITION_SLACK_MS = 80;

type Lock = "none" | "h" | "dead";

/** The iOS Mail row gesture for a list tile: the face follows the finger
 *  sideways over an action panel; release past the threshold commits (the
 *  face slides out, the action fires while the panel stands alone, then the
 *  face returns), release short of it snaps back. Vertical scrolling is never
 *  hijacked — the root needs `touch-action: pan-y` and the gesture only locks
 *  in once a drag is clearly horizontal. The hot path (pointermove) writes the
 *  transform imperatively and touches React state only on direction/armed
 *  changes.
 *
 *  Gate on TOUCH_QUERY at the call site, not on pointerType: every pointer is
 *  accepted so Chrome's device emulation exercises the same code. */
export function useSwipeActions({ swipeLeft, swipeRight }: { swipeLeft: SwipeAction; swipeRight: SwipeAction }): {
  rootRef: RefObject<HTMLLIElement>;
  faceRef: RefObject<HTMLDivElement>;
  phase: SwipePhase;
  armed: boolean;
  /** The panel to render behind the face, or null when nothing is revealed.
   *  Frozen at commit so the label can't flip mid-animation. */
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
  const rootRef = useRef<HTMLLIElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<SwipePhase>("idle");
  const [armed, setArmedState] = useState(false);
  const [panel, setPanelState] = useState<{ dir: SwipeDir; action: SwipeAction } | null>(null);

  const pressed = useRef(false);
  const locked = useRef<Lock>("none");
  const startX = useRef(0);
  const startY = useRef(0);
  const pointerId = useRef(-1);
  const width = useRef(0);
  const threshold = useRef(0);
  const offset = useRef(0);
  // Direction the panel currently shows, null while nothing is revealed.
  const shownDir = useRef<SwipeDir | null>(null);
  const armedRef = useRef(false);
  // Set once a press has become a drag so the click the browser may still
  // synthesise on release is swallowed rather than opening the puzzle.
  const swipedRef = useRef(false);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<SwipePhase>("idle");
  const alive = useRef(true);
  const pendingEnd = useRef<(() => void) | null>(null);
  // The actions are rebuilt every render (their labels flip after a commit),
  // and onCommit fires from a timer, so it reads the latest through a ref.
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
  const setPanel = (p: { dir: SwipeDir; action: SwipeAction } | null) => {
    shownDir.current = p?.dir ?? null;
    if (alive.current) setPanelState(p);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
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
    moveFace(dir === "left" ? -width.current : width.current);
    // Firing onCommit while the face is parked means the badge/label change
    // is already rendered when the card comes back; `panel` stays frozen so
    // the label can't flip during the hold.
    afterTransition(COMMIT_OUT_MS, () => {
      const action = dir === "left" ? actions.current.swipeLeft : actions.current.swipeRight;
      action.onCommit();
      timers.current.push(window.setTimeout(returnHome, COMMIT_HOLD_MS));
    });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (phaseRef.current !== "idle") {
      // A tap mid-animation never opens a puzzle whose state is changing.
      swipedRef.current = true;
      return;
    }
    // No capture yet: capturing on down would retarget a plain tap's click to
    // the li and the card's onClick would never see it.
    swipedRef.current = false;
    pressed.current = true;
    locked.current = "none";
    startX.current = e.clientX;
    startY.current = e.clientY;
    pointerId.current = e.pointerId;
    offset.current = 0;
    armedRef.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (!pressed.current || locked.current === "dead" || e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const mag = Math.abs(dx);
    if (locked.current === "none") {
      if (mag > INTENT_PX && mag > Math.abs(dy)) {
        locked.current = "h";
        swipedRef.current = true;
        const root = rootRef.current;
        width.current = root?.getBoundingClientRect().width ?? 0;
        threshold.current = Math.max(COMMIT_MIN_PX, COMMIT_FRACTION * width.current);
        try {
          root?.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic / unsupported pointers */
        }
        setPhase("drag");
      } else if (Math.abs(dy) > INTENT_PX) {
        // A scroll: pan-y hands it to the browser, which will usually
        // pointercancel us. Ambiguous jitter below INTENT_PX stays a tap.
        locked.current = "dead";
        pressed.current = false;
        return;
      } else return;
    }
    const dir: SwipeDir = dx < 0 ? "left" : "right";
    const action = dir === "left" ? swipeLeft : swipeRight;
    const live = !action.disabled;
    const sign = dx < 0 ? -1 : 1;
    // 1:1 under the finger like Mail, clamped at the tile's own width; an
    // inert side only budges enough for its label to explain why.
    moveFace(live ? sign * Math.min(mag, width.current) : sign * Math.min(mag * DISABLED_FOLLOW, DISABLED_PEEK_PX));
    if (shownDir.current !== dir) setPanel({ dir, action });
    const nowArmed = live && mag >= threshold.current;
    if (nowArmed !== armedRef.current) {
      setArmed(nowArmed);
      if (nowArmed) navigator.vibrate?.(10);
    }
  };

  const end = (cancel: boolean) => {
    if (!pressed.current) return;
    pressed.current = false;
    // A tap: the click proceeds to the card's onPress as before.
    if (locked.current !== "h") return;
    locked.current = "none";
    const dir = shownDir.current;
    if (!cancel && armedRef.current && dir) commit(dir);
    else returnHome();
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerId === pointerId.current) end(false);
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerId === pointerId.current) end(true);
  };
  // Safety net only: capture normally ends through pointerup/cancel above.
  const onLostPointerCapture = (e: ReactPointerEvent<HTMLLIElement>) => {
    if (e.pointerId === pointerId.current && pressed.current && locked.current === "h") {
      pressed.current = false;
      locked.current = "none";
      returnHome();
    }
  };
  // Runs before the card's onClick and MutualStack's own onClick, whichever
  // element the browser targets the post-drag click at. iOS fires no click
  // after a drag; the flag is reset on the next accepted pointerdown so a
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
    const onHide = () => {
      if (document.visibilityState !== "hidden" || phaseRef.current === "idle") return;
      // The user has already seen the face commit: land the action now and
      // skip only the animation, rather than dropping it with the timers.
      if (phaseRef.current === "commit") pendingEnd.current?.();
      pressed.current = false;
      locked.current = "none";
      try {
        rootRef.current?.releasePointerCapture(pointerId.current);
      } catch {
        /* not captured */
      }
      finish();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", onHide);
      timers.current.forEach(clearTimeout);
    };
    // finish() touches only refs and stable setters, so the first render's
    // closure is as good as any.
  }, []);

  return {
    rootRef,
    faceRef,
    phase,
    armed,
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
