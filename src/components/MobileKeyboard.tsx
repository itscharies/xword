import type { Crossword } from "../hooks/useCrossword.ts";
import { RebusIcon } from "./RebusIcon.tsx";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function MobileKeyboard({ xw }: { xw: Crossword }) {
  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 && (
            <button
              className={`kb-key wide ${xw.rebus ? "active" : ""}`}
              onClick={() => xw.toggleRebus()}
              aria-pressed={xw.rebus}
              aria-label="Rebus: type multiple letters in one square"
            >
              <RebusIcon />
            </button>
          )}
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
