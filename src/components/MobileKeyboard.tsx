import type { Crossword } from "../hooks/useCrossword.ts";
import { RebusIcon } from "./RebusIcon.tsx";
import { AnagramCircleIcon } from "./icons.tsx";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function MobileKeyboard({
  xw,
  onAnagram,
}: {
  xw: Crossword;
  onAnagram: () => void;
}) {
  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 &&
            (xw.isCryptic ? (
              <button
                className="kb-key wide"
                onClick={onAnagram}
                aria-label="Anagram helper"
              >
                <AnagramCircleIcon />
              </button>
            ) : (
              <button
                className={`kb-key wide ${xw.rebus ? "active" : ""}`}
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
              className="kb-key"
              onClick={() => xw.typeLetter(ch)}
            >
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button className="kb-key wide" onClick={() => xw.backspace()}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
