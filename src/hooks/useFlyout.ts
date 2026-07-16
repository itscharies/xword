import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/** Shared open/close logic for the hover-or-tap flyouts (SolvesFlyout, Tip,
 *  the archive tiles' mutual stacks). Hover open/close is mouse-only: a tap
 *  fires synthetic mouse events too, and letting those open the panel would
 *  make the tap's click toggle it straight back shut. Touch drives open
 *  purely through the caller's click toggle. */
export function useFlyout<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<T>(null);

  // Tap-elsewhere dismissal — blur is no good for it (iOS never focuses
  // buttons on tap), so watch the document while open.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [open]);

  // Spread onto the wrapper element alongside ref={wrapRef}.
  const hoverProps = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") setOpen(true);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") setOpen(false);
    },
  };

  return { open, setOpen, wrapRef, hoverProps };
}
