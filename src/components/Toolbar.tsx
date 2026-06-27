import { useEffect, useRef, useState } from "react";
import type { Crossword, RevealScope } from "../hooks/useCrossword.ts";
import { RebusIcon } from "./RebusIcon.tsx";

function Dropdown({
  label,
  danger,
  onPick,
}: {
  label: string;
  danger?: boolean;
  onPick: (scope: RevealScope) => void;
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

  return (
    <div className="tb-group" ref={ref}>
      <button
        className={`btn ${danger ? "danger" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      {open && (
        <div className="menu">
          {(["cell", "word", "puzzle"] as RevealScope[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({
  xw,
  onRequestReset,
}: {
  xw: Crossword;
  onRequestReset: () => void;
}) {
  return (
    <div className="toolbar">
      <Dropdown label="Check" onPick={xw.check} />
      <Dropdown label="Reveal" onPick={xw.reveal} />
      <button
        className={`btn rebus-btn ${xw.rebus ? "active" : ""}`}
        onClick={() => xw.toggleRebus()}
        aria-pressed={xw.rebus}
        title="Rebus: type multiple letters in one square"
      >
        <RebusIcon />
      </button>
      <button className="btn" onClick={onRequestReset}>
        Reset
      </button>
    </div>
  );
}
