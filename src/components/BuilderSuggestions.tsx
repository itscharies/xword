import { useEffect, useState } from "react";
import type { Builder } from "../hooks/useBuilder.ts";
import { suggest, type Suggestion } from "../lib/wordlist.ts";

/** Fill suggestions for the active slot: words from the list that match the
 *  current letter pattern (crossing letters included), ranked by score. */
export function BuilderSuggestions({ b }: { b: Builder }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const pattern = b.mode === "fill" ? b.activePattern : null;

  useEffect(() => {
    if (!pattern) {
      setItems([]);
      setState("idle");
      return;
    }
    let live = true;
    setState("loading");
    suggest(pattern, 300)
      .then((r) => {
        if (live) {
          setItems(r);
          setState("ready");
        }
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [pattern]);

  if (b.mode !== "fill") return null;

  return (
    <div className="builder-suggest">
      <div className="builder-suggest-head">
        <span>Suggestions</span>
        {pattern && (
          <span className="builder-suggest-pat">
            {pattern.replace(/\./g, "·")}
          </span>
        )}
      </div>
      {state === "loading" && (
        <p className="builder-suggest-msg">Loading word list…</p>
      )}
      {state === "error" && (
        <p className="builder-suggest-msg">Couldn't load the word list.</p>
      )}
      {state === "ready" && items.length === 0 && (
        <p className="builder-suggest-msg">No matching words.</p>
      )}
      {items.length > 0 && (
        <ul className="builder-suggest-list">
          {items.map((s) => (
            <li key={s.word}>
              <button onClick={() => b.fillSlot(s.word)} title={`Score ${s.score}`}>
                <span className="sug-word">{s.word}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="builder-suggest-attr">
        Words from{" "}
        <a
          href="https://www.spreadthewordlist.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Spread the Word(list)
        </a>{" "}
        · CC BY-NC-SA 4.0
      </p>
    </div>
  );
}
