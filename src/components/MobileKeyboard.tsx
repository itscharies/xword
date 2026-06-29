import type { Crossword } from "../hooks/useCrossword.ts";
import type { WordEntry } from "../hooks/useWordEntry.ts";
import { RebusIcon } from "./RebusIcon.tsx";
import { AnagramCircleIcon } from "./icons.tsx";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function MobileKeyboard({
  xw,
  onAnagram,
  anagramEntry,
}: {
  xw: Crossword;
  onAnagram: () => void;
  /** When the anagram overlay is open, keystrokes fill its answer instead. */
  anagramEntry?: WordEntry | null;
}) {
  const typeLetter = (ch: string) =>
    anagramEntry ? anagramEntry.type(ch) : xw.typeLetter(ch);
  const backspace = () =>
    anagramEntry ? anagramEntry.backspace() : xw.backspace();

  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {i === 2 &&
            (xw.isCryptic ? (
              <button
                className={`kb-key wide ${anagramEntry ? "active" : ""}`}
                onClick={onAnagram}
                aria-label="Anagram helper"
                aria-pressed={!!anagramEntry}
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
              onClick={() => typeLetter(ch)}
            >
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button className="kb-key wide" onClick={backspace}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
