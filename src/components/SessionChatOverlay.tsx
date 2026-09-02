import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { SessionApi } from "../hooks/useSession.ts";
import { SessionChatThread } from "./SessionChatThread.tsx";
import { useScrollLock } from "../hooks/useScrollLock.ts";
import {
  readViewportGeometry,
  useVisualViewportSheet,
  viewportStyle,
} from "../hooks/useVisualViewport.ts";

/** The sheet's only two tab stops. Same shape as Modal's list, minus the
 *  selectors nothing here renders. */
const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

/** Session chat's mobile shell: a full-screen sheet layered *over* .main and
 *  .mobile-bar, which stay mounted. That's the fix — the old shell was
 *  rendered *instead of* them, removing ~520px of in-flow content, which
 *  collapsed the document below `.app { min-height: 100svh }` and made the
 *  browser clamp window.scrollY to 0 (unrecoverable: you can't restore to an
 *  offset a shorter document doesn't have). Nothing behind this sheet changes
 *  now, so there is no clamp and nothing to restore.
 *
 *  Portalled to <body> rather than rendered in the tree: in
 *  [data-grid-fit="canvas"] mode .solve-body is position: sticky, a stacking
 *  context that would trap a fixed child underneath it.
 *
 *  Geometry lives entirely in CSS custom properties written by
 *  useVisualViewportSheet — see .sc-sheet in index.css. The composer is just
 *  the last flex child of a correctly-sized box, so there's no keyboard inset
 *  on it, no position: fixed, no sticky, and nothing to keep in sync. Unlike
 *  every other overlay in the app this one has a close button of its own: it
 *  covers the Toolbar chat button that would otherwise toggle it. */
export function SessionChatOverlay({
  session,
  userId,
  onClose,
  portalTo,
}: {
  session: SessionApi;
  userId: string;
  onClose: () => void;
  /** Stories only. The sheet portals here instead of <body>, and because the
   *  stage element carries a transform it becomes the containing block for
   *  the sheet's position: fixed — so Ladle shows it at phone size instead of
   *  it covering the whole story browser. Passing it also skips the page
   *  scroll lock, which would otherwise freeze Ladle itself. Undefined in the
   *  app, where the sheet resolves against the layout viewport, which is the
   *  entire point. */
  portalTo?: HTMLElement;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Captured during the first render, before the mount focus below moves it —
  // the Toolbar chat button, which the sheet covers. Same pattern as Modal.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && document.activeElement instanceof HTMLElement) {
    openerRef.current = document.activeElement;
  }
  // App.tsx passes an inline arrow and App re-renders once a second for the
  // timer — keep that identity out of every effect's dependency list, or the
  // listeners below would tear down and re-attach every second.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useScrollLock(!portalTo);
  useVisualViewportSheet(sheetRef);

  // Measured during render, not in an effect, so the very first painted frame
  // is already the right shape — no default-then-correct two-step. Held in a
  // ref so the object identity and its values are stable across re-renders:
  // React's style diff then does nothing on update and never clobbers
  // useVisualViewportSheet's own writes to the same four properties.
  const firstStyle = useRef<CSSProperties>();
  if (!firstStyle.current) {
    firstStyle.current = viewportStyle(readViewportGeometry()) as CSSProperties;
  }

  const requestClose = useCallback(() => {
    // Blur first, synchronously, before anything unmounts. Tearing down a
    // fixed layer with an input still focused is the repro for the open iOS 26
    // WebKit bug that leaves fixed elements permanently offset by the
    // keyboard's height (Apple developer forums 797097).
    (document.activeElement as HTMLElement | null)?.blur?.();
    closeRef.current();
  }, []);

  // The composer focuses itself (SessionChatThread's autoFocus), which is what
  // brings the keyboard up together with the sheet instead of a tap later —
  // and the two land as one motion rather than two, because focusing a text
  // field arms useVisualViewport's remembered keyboard height, so the composer
  // has already moved to where the keys are about to be before they animate
  // in. Nothing is focused here, then: this effect exists only to hand focus
  // back on the way out.
  useLayoutEffect(() => {
    return () => {
      // Hand focus back so keyboard users land where they left off, rather
      // than stranded on <body>. The opener can be gone by now.
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Escape + focus trap, on the document rather than the sheet's own subtree:
  // iOS parks focus on <body> when the keyboard's Done button dismisses it, and
  // a React onKeyDown would then never see the key. Mirrors Modal's trap,
  // including re-querying per keydown rather than caching.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // A Modal can open on top of the sheet (the session-ended notice fires
        // on a timer). It's the frontmost layer, so Escape is its to handle —
        // and this listener is on document while Modal's is on window, so
        // without the check this one would run first and swallow it.
        if (document.querySelector(".overlay")) return;
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) return;
      const active = document.activeElement;
      // The sheet root itself is tabindex=-1 and holds focus on mount, so it
      // is never in `items` — treat it as "before the first" so Shift+Tab
      // wraps to the end instead of escaping to the page behind.
      if (e.shiftKey && (active === items[0] || active === sheet || !sheet.contains(active))) {
        e.preventDefault();
        items[items.length - 1].focus({ preventScroll: true });
      } else if (
        !e.shiftKey &&
        (active === items[items.length - 1] || !sheet.contains(active))
      ) {
        e.preventDefault();
        items[0].focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return createPortal(
    <div
      ref={sheetRef}
      className="sc-sheet"
      style={firstStyle.current}
      role="dialog"
      aria-modal="true"
      aria-label="Session chat"
      tabIndex={-1}
    >
      <div className="sc-sheet-head">
        <h2 className="sc-sheet-title">Chat</h2>
        {/* The literal glyph at .modal-close's weight — icons.tsx has no X,
            and this keeps the app's two close affordances identical. */}
        <button
          className="btn icon-btn sc-sheet-close"
          onClick={requestClose}
          aria-label="Close chat"
        >
          ×
        </button>
      </div>
      <SessionChatThread session={session} userId={userId} onEscape={requestClose} />
    </div>,
    portalTo ?? document.body,
  );
}
