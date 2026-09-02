import { useLayoutEffect } from "react";

/** Module-level refcount, so two overlapping locks — or React StrictMode
 *  double-invoking effects in dev — can't strand the class on <html>. */
let locks = 0;

/** The nearest ancestor that can genuinely scroll vertically: overflow-y of
 *  auto/scroll AND content that actually overflows. The overflow test is the
 *  load-bearing half — overscroll-behavior is a partial implementation on
 *  iOS 16+ with no effect at all on a container that doesn't overflow
 *  (webkit.org/b/243452), i.e. exactly a short chat thread, so that case has
 *  to fall through to here and be blocked. */
function scrollableAncestor(from: EventTarget | null): Element | null {
  let el = from instanceof Element ? from : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Freezes the page behind a full-screen sheet *without moving it*.
 *
 * `overflow: hidden` on the documentElement retains the current scroll offset
 * rather than resetting it, so unlocking is a pure class removal with nothing
 * to restore and therefore no restoration jump. That's the whole reason not to
 * use the classic `position: fixed; top: -scrollY` body lock: that technique
 * *is* the jump, and it additionally falls apart across the viewport resize a
 * keyboard guarantees.
 *
 * It also does the real work on iOS: WebKit deliberately turns off
 * position: fixed behaviour while the keyboard is up (bug 132537) and lays
 * fixed elements out against the document at the layout viewport's committed
 * origin. Freezing the scroll offset makes that origin a constant, so "fixed"
 * and "glued to the top of the current layout viewport" become the same thing
 * — which is what lets .sc-sheet be a fixed box at all.
 *
 * iOS ignores overflow: hidden for touch, so it's backed by a capture-phase
 * non-passive touchmove blocker. Note the sheet does NOT try to suppress iOS's
 * programmatic scroll-to-reveal-a-focused-input: no touch event is involved so
 * no blocker could, and it doesn't need to — with the document unscrollable,
 * iOS satisfies the reveal by offsetting the visual viewport instead, which
 * .sc-sheet absorbs via padding-top: var(--sc-vvtop).
 */
export function useScrollLock(enabled: boolean) {
  // useLayoutEffect: the lock has to be in place in the same commit that
  // paints the sheet, or there's a frame where the page is still live under it.
  useLayoutEffect(() => {
    if (!enabled) return;

    const html = document.documentElement;
    const savedX = window.scrollX;
    const savedY = window.scrollY;
    if (locks++ === 0) html.classList.add("sc-locked");

    let scroller: Element | null = null;
    let resolved = false;
    const onTouchStart = (e: TouchEvent) => {
      // Multi-touch (a pinch) has no single scroll target; leave it unresolved
      // rather than latching null, or the one-finger drag that follows the
      // pinch — same gesture, no new touchstart — would be blocked outright.
      resolved = e.touches.length === 1;
      scroller = resolved ? scrollableAncestor(e.target) : null;
    };
    const onTouchEnd = () => {
      resolved = false;
      scroller = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // pinch zoom stays available (WCAG 1.4.4)
      const t = e.target;
      // Drag-to-select and caret dragging inside the composer still work.
      if (t instanceof HTMLElement && t.closest("input, textarea, [contenteditable]")) return;
      if (!resolved) {
        // First single-finger move after a pinch — work out the target now.
        resolved = true;
        scroller = scrollableAncestor(t);
      }
      // Let the message list scroll itself; block everything else.
      if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      scroller = null;
      if (--locks === 0) html.classList.remove("sc-locked");
      // An assertion, not the mechanism. The document's height never changed
      // while the sheet was up (it layers over .main/.mobile-bar rather than
      // replacing them, and with resizes-visual the ICB — and so every svh
      // length — is constant too), so savedY is still a legal offset and this
      // can't fail the way a post-hoc restore against a shrunken document
      // does. It should be a no-op on every cycle; if it ever isn't, one of
      // those invariants regressed.
      if (window.scrollY !== savedY || window.scrollX !== savedX) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[sc-sheet] page scrolled under the sheet", { savedY, now: window.scrollY });
        }
        window.scrollTo(savedX, savedY);
      }
    };
  }, [enabled]);
}
