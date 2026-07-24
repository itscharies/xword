import { useEffect, type ReactNode } from "react";

/** Shared modal dialog: dimmed overlay + square panel. Closes on overlay
 * click, the × button, or Escape. Used for settings, confirmations, and the
 * completion screen so every dialog looks and behaves the same. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      {/* The wrapper (not the panel) is the dialog, so the close button —
          floated outside the panel — still lives inside the aria-modal
          boundary for screen readers. */}
      <div
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
