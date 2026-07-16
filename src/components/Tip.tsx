import type { ReactNode } from "react";
import { useFlyout } from "../hooks/useFlyout.ts";

/** A tooltip that also works on touch: hover (mouse) or tap (a plain toggle)
 *  opens a small flyout panel below the trigger. Use instead of title=
 *  wherever the tooltip is the only way to reach the information — native
 *  titles never show on mobile. `children` is the visible trigger; add
 *  className="tip-text" when it's plain text (dotted-underline affordance)
 *  and tip-up / tip-right to flip which way the panel opens. */
export function Tip({
  tip,
  label,
  className,
  children,
}: {
  tip: ReactNode;
  /** Accessible name for the trigger, e.g. "About the puzzle style setting". */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const { open, setOpen, wrapRef, hoverProps } = useFlyout<HTMLSpanElement>();
  return (
    <span
      ref={wrapRef}
      className={`tip ${className ?? ""} ${open ? "open" : ""}`}
      {...hoverProps}
    >
      <span
        className="tip-trigger"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => {
          // Some triggers sit inside other clickable things (bylines, rows);
          // a tap that opens the panel shouldn't also activate those.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        {children}
      </span>
      <span className="tip-panel" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
