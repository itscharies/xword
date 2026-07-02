import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Crossword, RevealScope } from "../hooks/useCrossword.ts";
import { RebusIcon } from "./RebusIcon.tsx";
import { AnagramIcon, CheckIcon, ChevronDownIcon, EyeIcon, ResetIcon } from "./icons.tsx";

function Dropdown({
  label,
  icon,
  onPick,
}: {
  label: string;
  icon: ReactNode;
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
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-label={label}>
        <span className="btn-icon">{icon}</span>
        <span className="btn-label">{label}</span>
        <span className="btn-caret"><ChevronDownIcon /></span>
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
  onAnagram,
}: {
  xw: Crossword;
  onRequestReset: () => void;
  onAnagram: () => void;
}) {
  return (
    <div className="toolbar">
      <Dropdown label="Check" icon={<CheckIcon />} onPick={xw.check} />
      <Dropdown label="Reveal" icon={<EyeIcon />} onPick={xw.reveal} />
      {xw.isCryptic ? (
        <button
          className="btn anagram-btn"
          onClick={onAnagram}
          title="Anagram helper"
        >
          <span className="btn-icon">
            <AnagramIcon />
          </span>
          <span className="btn-label">Anagram</span>
        </button>
      ) : (
        <button
          className={`btn rebus-btn ${xw.rebus ? "active" : ""}`}
          onClick={() => xw.toggleRebus()}
          aria-pressed={xw.rebus}
          title="Rebus: type multiple letters in one square"
        >
          <RebusIcon />
        </button>
      )}
      <button className="btn" onClick={onRequestReset} aria-label="Reset">
        <span className="btn-icon">
          <ResetIcon />
        </span>
        <span className="btn-label">Reset</span>
      </button>
    </div>
  );
}
