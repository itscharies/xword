import { useEffect, useRef, useState } from "react";
import type { PuzzleIndexEntry } from "../types.ts";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Date picker as a custom flyout, matching the Check/Reveal menus. Scrolls
 * when the archive grows long. */
export function PuzzlePicker({
  index,
  value,
  onChange,
}: {
  index: PuzzleIndexEntry[];
  value: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = index.find((p) => p.date === value);

  return (
    <div className="tb-group" ref={ref}>
      <button
        className="btn picker-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current ? formatDate(current.isoDate) : "Select date"} ▾
      </button>
      {open && (
        <div className="menu date-menu" role="listbox">
          {index.map((p) => (
            <button
              key={p.date}
              role="option"
              aria-selected={p.date === value}
              className={p.date === value ? "active" : ""}
              onClick={() => {
                onChange(p.date);
                setOpen(false);
              }}
            >
              {formatDate(p.isoDate)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
