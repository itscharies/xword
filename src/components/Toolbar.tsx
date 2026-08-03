import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Crossword, RevealScope } from "../hooks/useCrossword.ts";
import { getAutocheck } from "../lib/theme.ts";
import { RebusIcon } from "./RebusIcon.tsx";
import { Tip } from "./Tip.tsx";
import { AnagramIcon, CheckIcon, ChevronDownIcon, EyeIcon, ResetIcon } from "./icons.tsx";

function Dropdown({
  label,
  icon,
  onPick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onPick: (scope: RevealScope) => void;
  disabled?: boolean;
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
        className="btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        disabled={disabled}
      >
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
  hideReset,
}: {
  xw: Crossword;
  onRequestReset: () => void;
  onAnagram: () => void;
  /** Co-op sessions: reset would blow away everyone's shared grid (and the
   *  sync protocol has no way to express it), so the button goes away. */
  hideReset?: boolean;
}) {
  return (
    <div className="toolbar">
      {getAutocheck() ? (
        // With autocheck on there's nothing left to check by hand. A truly
        // disabled button would eat the hover/tap that could explain itself,
        // so this one only *looks* disabled and answers with a tip instead.
        <Tip
          tip="Autocheck is on — letters are checked as they're typed. Turn it off in Settings to check by hand."
          label="Check (autocheck is on)"
        >
          <span className="btn btn-inert" aria-disabled="true">
            <span className="btn-icon"><CheckIcon /></span>
            <span className="btn-label">Check</span>
            <span className="btn-caret"><ChevronDownIcon /></span>
          </span>
        </Tip>
      ) : (
        <Dropdown label="Check" icon={<CheckIcon />} onPick={xw.check} disabled={xw.completed} />
      )}
      <Dropdown label="Reveal" icon={<EyeIcon />} onPick={xw.reveal} disabled={xw.completed} />
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
          disabled={xw.completed}
          title="Rebus: type multiple letters in one square"
        >
          <RebusIcon />
        </button>
      )}
      {!hideReset && (
        <button className="btn" onClick={onRequestReset} aria-label="Reset">
          <span className="btn-icon">
            <ResetIcon />
          </span>
          <span className="btn-label">Reset</span>
        </button>
      )}
    </div>
  );
}
