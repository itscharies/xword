import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Builder } from "../hooks/useBuilder.ts";
import { suggest, type Suggestion } from "../lib/wordlist.ts";
import { define, googleUrl, type Definition } from "../lib/define.ts";

const LINGER_MS = 250;
// Gap between the chip and the popover.
const GAP = 10;

/** Fill suggestions for the active slot: words from the list that match the
 *  current letter pattern (crossing letters included), ranked by score.
 *  Lingering on a word for 2s pops up a short definition. */
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

  // ---- hover-to-define popover -------------------------------------------
  const [hover, setHover] = useState<{
    word: string;
    x: number;
    chipTop: number;
    chipBottom: number;
  } | null>(null);
  // Resolved placement, measured against the popover's real height after render.
  const [pos, setPos] = useState<{ top: number; above: boolean } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [def, setDef] = useState<{ loading: boolean; data: Definition | null }>({
    loading: false,
    data: null,
  });
  const lingerTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(null), 200);
  };
  const onChipEnter = (word: string, e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return; // hover is a desktop affordance
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(lingerTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Clamp to the right edge; vertical placement is resolved after render once
    // the popover's real height is known (see the layout effect below).
    const x = Math.min(rect.left, window.innerWidth - 272);
    lingerTimer.current = window.setTimeout(() => {
      setPos(null);
      setHover({ word, x, chipTop: rect.top, chipBottom: rect.bottom });
    }, LINGER_MS);
  };
  const onChipLeave = () => {
    window.clearTimeout(lingerTimer.current);
    scheduleClose();
  };

  // Fetch the definition whenever the popover targets a new word.
  useEffect(() => {
    if (!hover) return;
    let live = true;
    setDef({ loading: true, data: null });
    define(hover.word)
      .then((d) => live && setDef({ loading: false, data: d }))
      .catch(() => live && setDef({ loading: false, data: null }));
    return () => {
      live = false;
    };
  }, [hover?.word]);

  // Resolve above/below from the popover's real height so it never spills past
  // the window. Runs before paint (and again when the content resizes).
  useLayoutEffect(() => {
    if (!hover || !popRef.current) return;
    const h = popRef.current.offsetHeight;
    const vh = window.innerHeight;
    const fitsBelow = hover.chipBottom + GAP + h <= vh;
    const above =
      !fitsBelow &&
      (hover.chipTop - GAP - h >= 0 || hover.chipTop > vh - hover.chipBottom);
    const top = above
      ? Math.max(hover.chipTop - GAP, h + 4) // translateY(-100%): visual top ≥ 4
      : Math.min(hover.chipBottom + GAP, vh - h - 4);
    setPos((p) =>
      p && p.top === top && p.above === above ? p : { top, above },
    );
  }, [hover, def.loading, def.data]);

  useEffect(
    () => () => {
      window.clearTimeout(lingerTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

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
              <button
                onClick={() => b.fillSlot(s.word)}
                onPointerEnter={(e) => onChipEnter(s.word, e)}
                onPointerLeave={onChipLeave}
              >
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

      {hover && (
        <div
          ref={popRef}
          className={`def-popover ${pos?.above ? "above" : ""}`}
          style={{ left: hover.x, top: pos ? pos.top : hover.chipBottom + GAP }}
          onPointerEnter={() => window.clearTimeout(closeTimer.current)}
          onPointerLeave={scheduleClose}
        >
          {def.loading ? (
            <p className="def-msg">Looking up “{hover.word}”…</p>
          ) : def.data ? (
            <>
              <div className="def-title">{def.data.title}</div>
              <p className="def-extract">{def.data.extract}</p>
              <div className="def-foot">
                <span className="def-src">{def.data.source}</span>
                <a href={googleUrl(hover.word)} target="_blank" rel="noopener noreferrer">
                  Google ↗
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="def-msg">No definition found.</p>
              <div className="def-foot">
                <span className="def-src" />
                <a href={googleUrl(hover.word)} target="_blank" rel="noopener noreferrer">
                  Search Google ↗
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
