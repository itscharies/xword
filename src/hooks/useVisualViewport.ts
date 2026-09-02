import { useLayoutEffect, type RefObject } from "react";

/** Below this a reading is rounding noise, not real occlusion. Deliberately
 *  tiny: anything larger would have to guess where the browser's collapsing
 *  bottom chrome ends and the keyboard begins, and both want the same
 *  treatment — the composer's bottom edge belongs on the *visible* bottom
 *  edge either way. */
const NOISE_FLOOR = 8;

/** The sheet always keeps at least this much content box, so an optimistic
 *  keyboard guess can never squeeze the header and composer into each other. */
const MIN_CONTENT_PX = 120;

/** The last real keyboard height seen this page load. Module-level so it
 *  survives the sheet unmounting between opens: it lets the composer move to
 *  where the keyboard is *about* to be at the moment of the tap, rather than
 *  a frame or two later once visualViewport reports (see the focusin handler
 *  below). That matters for more than smoothness — iOS only shifts the
 *  visual viewport (visualViewport.offsetTop) when it thinks the focused
 *  input would otherwise be covered, and offsetTop is the one value with a
 *  known WebKit bug in installed-PWA mode. Less to reveal, less to shift. */
let rememberedKeyboard = 0;

export type ViewportGeometry = {
  /** visualViewport.offsetTop: how far the visible region has been pushed
   *  down inside the layout viewport. iOS does this instead of scrolling the
   *  document when the document can't scroll — which, behind the sheet's
   *  scroll lock, is always. */
  offsetTop: number;
  /** Layout-viewport pixels covered at the bottom edge: the keyboard, plus
   *  the browser's own bottom chrome while it's showing. Not separated,
   *  deliberately — see NOISE_FLOOR. */
  keyboard: number;
};

/** One synchronous read of where the visible region actually is.
 *
 *  Both numbers are in *layout viewport* coordinates, which is the same space
 *  a position: fixed; inset: 0 box lives in — so they can be written straight
 *  into that box's padding with no conversion. Mixing these with
 *  getBoundingClientRect deltas is the canonical Android-only bug (Tiptap
 *  #7757); nothing here does that, and nothing added later should. */
export function readViewportGeometry(): ViewportGeometry {
  const vv = window.visualViewport;
  if (!vv) return { offsetTop: 0, keyboard: 0 };

  // Undo pinch-zoom before comparing. visualViewport.height shrinks as you
  // zoom in (it reports the *visible* slice of the layout viewport), while
  // clientHeight doesn't move — so a raw subtraction reads a zoom as a
  // several-hundred-pixel keyboard. index.html sets user-scalable=no, but iOS
  // Safari has ignored that since iOS 10 and the scroll lock deliberately
  // lets two-finger gestures through, so zoom is reachable. At scale 1 this
  // is a no-op; if the reading ever turned out not to be scale-dependent
  // after all, the failure mode is only that the keyboard goes unnoticed
  // while pinched, rather than a phantom one appearing.
  const scale = vv.scale || 1;
  const visible = vv.height * scale;
  const layout = document.documentElement.clientHeight;
  // Clamped into the only range that's physically possible. visualViewport
  // .offsetTop is reported as 0 with the keyboard up in installed-PWA mode on
  // some WebKit versions (webkit.org/b/237851, open since 2022); there is no
  // second, independent source for it — visualViewport.pageTop is derived
  // from the same value, so subtracting scrollY from it just gives the same
  // wrong answer back. What the clamp does buy is that a stale or garbage
  // read can never push the sheet's header further off the top of the screen
  // than the covered strip is tall.
  const ceiling = Math.max(0, layout - visible);
  const offsetTop = Math.min(Math.max(0, Math.round(vv.offsetTop * scale)), ceiling);

  const covered = layout - visible - offsetTop;
  const keyboard = covered > NOISE_FLOOR ? Math.round(covered) : 0;
  if (keyboard > 0) rememberedKeyboard = keyboard;
  return { offsetTop, keyboard };
}

/** The four custom properties .sc-sheet reads, as a style object. Shared with
 *  the component so the very first render can emit them inline and the first
 *  painted frame is already the right shape. */
export function viewportStyle(g: ViewportGeometry): Record<string, string> {
  return {
    "--sc-vvtop": `${g.offsetTop}px`,
    "--sc-kb": `${g.keyboard}px`,
    // Unitless multipliers, so env() is only ever read from CSS. Each edge's
    // safe-area inset applies only while that edge of the sheet's *content*
    // really is the physical screen edge: a covered bottom edge is sitting on
    // the keyboard (or on the browser's toolbar), where the home-indicator
    // inset would open a dead gap, and a shifted-down top edge is no longer
    // under the status bar. Both are exact tests, not thresholds — which is
    // why neither needs to know whether the occlusion is "a keyboard".
    "--sc-safe-top": g.offsetTop === 0 ? "1" : "0",
    "--sc-safe-bot": g.keyboard === 0 ? "1" : "0",
  };
}

/**
 * Keeps `ref`'s --sc-vvtop / --sc-kb / safe-area gates in step with
 * window.visualViewport, coalesced to one write per frame.
 *
 * Writes to the DOM node directly rather than through React state: a viewport
 * tick during the keyboard's animation must never schedule a render.
 */
export function useVisualViewportSheet(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let last = "";
    /** A remembered keyboard height applied ahead of the real measurement,
     *  armed on focus and disarmed as soon as a real one arrives (or after
     *  600ms, so a focus that summons no keyboard — hardware keyboard, a
     *  desktop browser — can't hold a phantom gap open). */
    let optimistic = 0;
    let timer = 0;

    const write = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const g = readViewportGeometry();
      if (optimistic && g.keyboard === 0) {
        // Never let the guess exceed what's actually there: padding-top plus
        // padding-bottom must leave the sheet a content box, or the header and
        // composer overlap and the message list collapses to nothing.
        const room = document.documentElement.clientHeight - g.offsetTop;
        g.keyboard = Math.max(0, Math.min(optimistic, room - MIN_CONTENT_PX));
      }
      const key = `${g.offsetTop}|${g.keyboard}`;
      if (key === last) return;
      last = key;
      const style = viewportStyle(g);
      for (const name of Object.keys(style)) el.style.setProperty(name, style[name]);
    };
    const schedule = () => {
      // rAF never runs while the page is hidden, which would leave `frame`
      // armed and swallow every later schedule() until it eventually fired.
      // Nothing is painting then anyway, so just write.
      if (document.hidden) {
        write();
        return;
      }
      if (!frame) frame = requestAnimationFrame(write);
    };
    /** Force the next write through even if the numbers happen to match. */
    const rewrite = () => {
      last = "";
      write();
    };

    write(); // synchronous, before the first paint

    // Only a real text-entry focus summons a keyboard. Gating on the target
    // matters more than it looks: the sheet focuses *itself* on mount for
    // dialog semantics, and without this test that focusin would arm the
    // remembered height and open a full keyboard-sized gap under the composer
    // for 600ms on every reopen after the first — the exact flash this
    // optimistic path exists to prevent.
    const summonsKeyboard = (t: EventTarget | null) =>
      t instanceof HTMLElement && !!t.closest("input, textarea, [contenteditable]");

    const onFocusIn = (e: FocusEvent) => {
      if (!summonsKeyboard(e.target)) return;
      if (!rememberedKeyboard) return;
      optimistic = rememberedKeyboard;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        optimistic = 0;
        rewrite();
      }, 600);
      rewrite();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!summonsKeyboard(e.target)) return;
      optimistic = 0;
      window.clearTimeout(timer);
      rewrite();
      // Safari isn't always prompt about reporting the collapsed viewport
      // after a dismissal, and there's no VisualViewport scrollend in WebKit
      // to wait on — re-read once the animation has had time to land.
      timer = window.setTimeout(rewrite, 250);
    };

    const vv = window.visualViewport;
    // resize AND scroll: the keyboard never fires a window resize under
    // resizes-visual (the layout viewport doesn't change), and offsetTop
    // updates arrive as visualViewport *scroll* events on a denser stream
    // than resize. window resize/orientationchange covers rotation, browser
    // chrome changes, and the no-VisualViewport fallback.
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    const onOrientation = () => {
      // A landscape keyboard is far shorter than a portrait one; carrying the
      // old height over would pre-apply a badly wrong gap on the next focus.
      rememberedKeyboard = 0;
      optimistic = 0;
      schedule();
    };
    window.addEventListener("orientationchange", onOrientation);
    el.addEventListener("focusin", onFocusIn as EventListener);
    el.addEventListener("focusout", onFocusOut as EventListener);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", onOrientation);
      el.removeEventListener("focusin", onFocusIn as EventListener);
      el.removeEventListener("focusout", onFocusOut as EventListener);
    };
  }, [ref]);
}
