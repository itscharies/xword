import { useState } from "react";
import type { AnagramPool } from "../hooks/useAnagramPool.ts";
import { RebusIcon } from "./RebusIcon.tsx";
import { AnagramCircleIcon, BackspaceIcon } from "./icons.tsx";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

/** The slice of the solver/builder engine the on-screen keyboard drives. Both
 *  `Crossword` and `Builder` satisfy this, so the keyboard is shared. */
export interface KeyboardEngine {
  typeLetter: (ch: string) => void;
  backspace: () => void;
  toggleRebus: () => void;
  rebus: boolean;
  isCryptic: boolean;
}

export function MobileKeyboard({
  xw,
  onAnagram,
  anagramPool,
}: {
  xw: KeyboardEngine;
  onAnagram: () => void;
  /** When the anagram overlay is open, keystrokes feed its letter pool. */
  anagramPool?: AnagramPool | null;
}) {
  const typeLetter = (ch: string) =>
    anagramPool ? anagramPool.add(ch) : xw.typeLetter(ch);
  const backspace = () =>
    anagramPool ? anagramPool.backspace() : xw.backspace();

  // Track the pressed key in state rather than relying on `:active`: iOS Safari
  // withholds `:active` for taps near the bottom edge (home-indicator / toolbar
  // zone), so the lower rows never flashed. Pointer events fire everywhere, and
  // state survives the per-second timer re-renders that a raw class toggle
  // would lose.
  const [pressed, setPressed] = useState<string | null>(null);
  const down = (id: string) => () => setPressed(id);
  const clear = () => setPressed(null);
  const pc = (id: string) => (pressed === id ? "kb-pressed" : "");

  return (
    <div
      className="keyboard"
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
    >
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 &&
            (xw.isCryptic ? (
              <button
                className={`kb-key wide ${anagramPool ? "active" : ""} ${pc("anagram")}`}
                onPointerDown={down("anagram")}
                onClick={onAnagram}
                aria-label="Anagram helper"
                aria-pressed={!!anagramPool}
              >
                <AnagramCircleIcon />
              </button>
            ) : (
              <button
                className={`kb-key wide ${xw.rebus ? "active" : ""} ${pc("rebus")}`}
                onPointerDown={down("rebus")}
                onClick={() => xw.toggleRebus()}
                aria-pressed={xw.rebus}
                aria-label="Rebus: type multiple letters in one square"
              >
                <RebusIcon />
              </button>
            ))}
          {row.split("").map((ch) => (
            <button
              key={ch}
              className={`kb-key ${pc(ch)}`}
              onPointerDown={down(ch)}
              onClick={() => typeLetter(ch)}
            >
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button
              className={`kb-key wide ${pc("backspace")}`}
              onPointerDown={down("backspace")}
              onClick={backspace}
            >
              <BackspaceIcon />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
