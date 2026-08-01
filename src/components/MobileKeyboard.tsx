import { useState, type MouseEvent } from "react";
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

  // Track the held key in state rather than relying on `:active`: iOS Safari
  // withholds `:active` for taps near the bottom edge (home-indicator / toolbar
  // zone), so the lower rows never flashed. Pointer events fire everywhere, and
  // state survives the per-second timer re-renders that a raw class toggle
  // would lose.
  const [pressed, setPressed] = useState<string | null>(null);
  const down = (id: string) => () => setPressed(id);
  const clear = () => setPressed(null);
  const pc = (id: string) => (pressed === id ? "kb-pressed" : "");

  // With Safari's chrome collapsed, iOS swallows the whole pointer stream for
  // taps in the bottom strip while it decides whether the tap re-expands the
  // URL bar — only the synthesized `click` ever arrives, so the held state
  // above never shows. Every click also retriggers a one-shot flash animation.
  // The class lives on the inner face, whose className prop is static, so
  // React's pressed-state re-renders can't clip the animation mid-flight.
  const flashFromClick = (e: MouseEvent) => {
    const face = (e.target as Element).closest(".kb-key")?.querySelector(".kb-face");
    if (!face) return;
    face.classList.remove("kb-flash");
    void (face as HTMLElement).offsetWidth; // restart if still mid-animation
    face.classList.add("kb-flash");
  };

  return (
    <div
      className="keyboard"
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onClickCapture={flashFromClick}
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
                <span className="kb-face">
                  <AnagramCircleIcon />
                </span>
              </button>
            ) : (
              <button
                className={`kb-key wide ${xw.rebus ? "active" : ""} ${pc("rebus")}`}
                onPointerDown={down("rebus")}
                onClick={() => xw.toggleRebus()}
                aria-pressed={xw.rebus}
                aria-label="Rebus: type multiple letters in one square"
              >
                <span className="kb-face">
                  <RebusIcon />
                </span>
              </button>
            ))}
          {row.split("").map((ch) => (
            <button
              key={ch}
              className={`kb-key ${pc(ch)}`}
              onPointerDown={down(ch)}
              onClick={() => typeLetter(ch)}
            >
              <span className="kb-face">{ch}</span>
            </button>
          ))}
          {i === 2 && (
            <button
              className={`kb-key wide ${pc("backspace")}`}
              onPointerDown={down("backspace")}
              onClick={backspace}
            >
              <span className="kb-face">
                <BackspaceIcon />
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
