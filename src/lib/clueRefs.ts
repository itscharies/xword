import type { Direction } from "../types.ts";

export interface ClueRef {
  number: number;
  direction: Direction;
}

// Match a run of clue numbers terminated by a direction word, e.g.
//   "17-, 22-, 33- and 47-Across"   -> 17,22,33,47 across
//   "See 23-Down"                    -> 23 down
//   "With 1-Across, ..."             -> 1 across
// A trailing "Across"/"Down" applies to every bare "<n>-" before it in the run.
const REF_RE = /((?:\d+\s*-\s*[, ]*(?:and\s+)?)+)(Across|Down)/gi;

/**
 * Extract cross-references to other entries from a clue's text, so the app can
 * highlight the linked answers when that clue is selected.
 */
export function parseClueRefs(text: string, self?: ClueRef): ClueRef[] {
  const refs: ClueRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    const direction = m[2].toLowerCase() as Direction;
    const numbers = m[1].match(/\d+/g) ?? [];
    for (const n of numbers) {
      const number = Number(n);
      const key = `${number}-${direction}`;
      if (seen.has(key)) continue;
      // Don't link a clue to itself.
      if (self && self.number === number && self.direction === direction) continue;
      seen.add(key);
      refs.push({ number, direction });
    }
  }
  return refs;
}
