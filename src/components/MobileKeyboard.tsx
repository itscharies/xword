import { useEffect, useRef, useState, type MouseEvent } from "react";
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
  //
  // With Safari's chrome collapsed, iOS swallows the touch/pointer stream for
  // taps in the bottom strip while it decides whether the tap re-expands the
  // URL bar — only the synthesized `click` ever reaches the page. So the
  // pressed flash is driven from click as well (delegated below), and every
  // flash is held for a minimum beat so a click-only tap still paints.
  const MIN_FLASH_MS = 100;
  const [pressed, setPressed] = useState<string | null>(null);
  const downAt = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(clearTimer.current), []);
  const flash = (id: string) => {
    clearTimeout(clearTimer.current);
    downAt.current = performance.now();
    setPressed(id);
  };
  const down = (id: string) => () => flash(id);
  const clear = () => {
    const left = MIN_FLASH_MS - (performance.now() - downAt.current);
    if (left <= 0) {
      setPressed(null);
    } else {
      clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setPressed(null), left);
    }
  };
  // Dead-zone taps arrive as a bare click with no pointer events: flash the
  // key now and schedule the clear, since no pointerup will follow either.
  const flashFromClick = (e: MouseEvent) => {
    const id = (e.target as Element).closest(".kb-key")?.getAttribute("data-key");
    if (id) {
      flash(id);
      clear();
    }
  };
  const pc = (id: string) => (pressed === id ? "kb-pressed" : "");

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
                data-key="anagram"
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
                data-key="rebus"
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
              data-key={ch}
              onPointerDown={down(ch)}
              onClick={() => typeLetter(ch)}
            >
              <span className="kb-face">{ch}</span>
            </button>
          ))}
          {i === 2 && (
            <button
              className={`kb-key wide ${pc("backspace")}`}
              data-key="backspace"
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
