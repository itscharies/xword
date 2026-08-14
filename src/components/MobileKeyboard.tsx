import { useRef, useState, type MouseEvent } from "react";
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
  //
  // The state is cleared on `click` rather than `pointerup`: click fires a
  // beat after pointerup on touch, and clearing on pointerup left a gap where
  // the key rendered un-pressed before the old click-driven flash re-pressed
  // it — a visible double-flash. Clearing on click instead keeps the key
  // painted pressed continuously from pointerdown through click.
  //
  // A ref shadows the state: pointerdown and the ensuing click can land in
  // the same React batch, so the click handler would otherwise read the
  // pre-pointerdown `pressed` value and never clear it. The ref is written
  // synchronously, so it's always current by the time click runs.
  const pressedRef = useRef<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const down = (id: string) => () => {
    pressedRef.current = id;
    setPressed(id);
  };
  const abort = () => {
    pressedRef.current = null;
    setPressed(null);
  };
  const pc = (id: string) => (pressed === id ? "kb-pressed" : "");

  // With Safari's chrome collapsed, iOS swallows the whole pointer stream for
  // taps in the bottom strip while it decides whether the tap re-expands the
  // URL bar — only the synthesized `click` ever arrives, so `pressedRef`
  // above never gets set. In that case only, fall back to a one-shot flash
  // animation on the face so the tap still gets visual feedback.
  const onKeyClick = (id: string) => (e: MouseEvent) => {
    if (pressedRef.current === id) {
      abort();
      return;
    }
    const face = (e.target as Element).closest(".kb-key")?.querySelector(".kb-face");
    if (!face) return;
    face.classList.remove("kb-flash");
    void (face as HTMLElement).offsetWidth; // restart if still mid-animation
    face.classList.add("kb-flash");
  };

  const tap = (id: string, action: () => void) => (e: MouseEvent) => {
    onKeyClick(id)(e);
    action();
  };

  return (
    <div
      className="keyboard"
      onPointerCancel={abort}
      onPointerLeave={abort}
    >
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 &&
            (xw.isCryptic ? (
              <button
                className={`kb-key wide ${anagramPool ? "active" : ""} ${pc("anagram")}`}
                onPointerDown={down("anagram")}
                onClick={tap("anagram", onAnagram)}
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
                onClick={tap("rebus", () => xw.toggleRebus())}
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
              onClick={tap(ch, () => typeLetter(ch))}
            >
              <span className="kb-face">{ch}</span>
            </button>
          ))}
          {i === 2 && (
            <button
              className={`kb-key wide ${pc("backspace")}`}
              onPointerDown={down("backspace")}
              onClick={tap("backspace", backspace)}
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
