import { useEffect, useRef, type ReactNode } from "react";

/** Anything Tab can land on. `[tabindex="-1"]` stays out: those are
 *  programmatic focus targets, not tab stops. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared modal dialog: dimmed overlay + square panel. Closes on overlay
 * click, the × button, or Escape. Used for settings, confirmations, and the
 * completion screen so every dialog looks and behaves the same. Keyboard
 * focus is managed here for all of them: it moves into the dialog on open,
 * Tab cycles stay inside, and the control that opened it gets focus back on
 * close. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // The control that opened the dialog, captured during the first render —
  // by the time the mount effect runs, an autoFocus control inside (Find
  // people's search box) may already hold focus and would be mistaken for
  // the opener, leaving focus stranded on <body> after close.
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && document.activeElement instanceof HTMLElement) {
    openerRef.current = document.activeElement;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // An autoFocus control inside (e.g. Find people's search box) has already
    // claimed focus by the time effects run; otherwise start on the dialog's
    // first focusable control, falling back to the wrapper itself.
    if (!wrap.contains(document.activeElement)) {
      (wrap.querySelector<HTMLElement>(FOCUSABLE) ?? wrap).focus();
    }

    // The list is re-queried per keydown, not cached: dialog content changes
    // while open (search results appearing, buttons disabling). The rects
    // filter drops hidden controls (Import's display:none file input) that
    // match the selector but can't take focus — native Tab skips them too.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...wrap.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) {
        e.preventDefault();
        wrap.focus();
        return;
      }
      const active = document.activeElement;
      // Wrap around at either end — and pull focus back in if it somehow
      // escaped (an element removed out from under it, a stray click).
      if (e.shiftKey && (active === items[0] || !wrap.contains(active))) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (active === items[items.length - 1] || !wrap.contains(active))) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      // Hand focus back so keyboard users land where they left off. The
      // opener can be gone by the time we close (a deleted tile's button).
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      {/* The wrapper (not the panel) is the dialog, so the close button —
          floated outside the panel — still lives inside the aria-modal
          boundary for screen readers. */}
      <div
        ref={wrapRef}
        tabIndex={-1}
        className="modal-wrap"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal">
          {title && <h2 className="modal-title">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}
