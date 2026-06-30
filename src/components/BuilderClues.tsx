import type { Direction } from "../types.ts";
import type { Builder } from "../hooks/useBuilder.ts";
import { slotKey, enumerationOf } from "../hooks/useBuilder.ts";
import { readWord, type WordStart } from "../lib/numbering.ts";

const dirShort = (d: Direction) => (d === "across" ? "A" : "D");

/** Manage the cross-references on the active clue: chips to remove, a dropdown
 *  to add a link to any other clue. */
function LinkEditor({
  b,
  sourceKey,
  byKey,
  all,
}: {
  b: Builder;
  sourceKey: string;
  byKey: Map<string, WordStart>;
  all: WordStart[];
}) {
  const linkedKeys = b.links.get(sourceKey) ?? [];
  const available = all.filter(
    (t) => slotKey(t) !== sourceKey && !linkedKeys.includes(slotKey(t)),
  );
  return (
    <div className="clue-links" onClick={(e) => e.stopPropagation()}>
      <span className="clue-links-label">Links</span>
      {linkedKeys.map((k) => {
        const t = byKey.get(k);
        return (
          <button
            key={k}
            className="link-chip"
            onClick={() => b.unlinkClue(sourceKey, k)}
            title="Remove link"
          >
            {t ? `${t.number}${dirShort(t.direction)}` : "?"} ×
          </button>
        );
      })}
      <select
        className="link-select"
        value=""
        onChange={(e) => e.target.value && b.linkClue(sourceKey, e.target.value)}
      >
        <option value="">+ link…</option>
        {available.map((t) => (
          <option key={slotKey(t)} value={slotKey(t)}>
            {t.number}
            {dirShort(t.direction)}
            {readWord(b.grid, t) ? ` ${readWord(b.grid, t)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Column({
  title,
  direction,
  starts,
  byKey,
  all,
  b,
}: {
  title: string;
  direction: Direction;
  starts: WordStart[];
  byKey: Map<string, WordStart>;
  all: WordStart[];
  b: Builder;
}) {
  const activeNumber =
    b.activeSlot?.direction === direction ? b.activeSlot.number : null;

  return (
    <div className="clue-col">
      <h2>{title}</h2>
      <ol>
        {starts.map((s) => {
          const key = slotKey(s);
          const answer = readWord(b.grid, s);
          const active = s.number === activeNumber;
          const linked = b.activeLinks.includes(key);
          return (
            <li
              key={key}
              className={`builder-clue ${active ? "active" : ""} ${linked ? "linked" : ""}`}
              onClick={() => b.selectSlot(s)}
            >
              <span className="cn">{s.number}</span>
              <div className="builder-clue-body">
                <input
                  className="ana-input clue-input"
                  value={b.clueText.get(key) ?? ""}
                  placeholder="Clue…"
                  onChange={(e) => b.setClue(key, e.target.value)}
                  onFocus={() => b.selectSlot(s)}
                />
                <span className="clue-answer">
                  {answer.padEnd(s.len, "·")} ({enumerationOf(b.grid, s)})
                </span>
                {active && (
                  <LinkEditor b={b} sourceKey={key} byKey={byKey} all={all} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function BuilderClues({ b }: { b: Builder }) {
  const all = [...b.acrossStarts, ...b.downStarts];
  const byKey = new Map(all.map((s) => [slotKey(s), s]));
  return (
    <div className="clues builder-clues">
      <Column title="Across" direction="across" starts={b.acrossStarts} byKey={byKey} all={all} b={b} />
      <Column title="Down" direction="down" starts={b.downStarts} byKey={byKey} all={all} b={b} />
    </div>
  );
}
