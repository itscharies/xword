import type { Direction } from "../types.ts";

export interface ClueRef {
  number: number;
  direction: Direction;
}

// Match a run of clue numbers terminated by a direction word, e.g.
//   "17-, 22-, 33- and 47-Across"   -> 17,22,33,47 across
//   "20-, 30-, or 46-Across"         -> 20,30,46 across
//   "See 23-Down"                    -> 23 down
//   "With 1-Across, ..."             -> 1 across
// A trailing "Across"/"Down" applies to every bare "<n>-" before it in the run.
// Numbers may be joined by commas/spaces or the words and/or/nor.
const REF_RE = /((?:\d+\s*-\s*[, ]*(?:(?:and|or|nor)\s+)?)+)(Across|Down)/gi;

/** "14-Across" — the label format the builder bakes into clue text. */
export function refLabel(number: number, direction: Direction): string {
  return `${number}-${direction === "across" ? "Across" : "Down"}`;
}

/** Bake cross-reference labels into a clue's text in the format parseClueRefs
 *  (and anyone else reading the exported file) picks up. */
export function appendRefs(clue: string, labels: string[]): string {
  if (!labels.length) return clue;
  const joined = labels.join(", ");
  return clue ? `${clue} (see ${joined})` : `See ${joined}`;
}

/** Exact inverse of appendRefs for the given labels — importing a puzzle
 *  whose structured links are known strips the baked text back out so it
 *  doesn't read as authored text and double up on the next export. */
export function stripRefs(clue: string, labels: string[]): string {
  if (!labels.length) return clue;
  const joined = labels.join(", ");
  if (clue === `See ${joined}`) return "";
  const suffix = ` (see ${joined})`;
  return clue.endsWith(suffix) ? clue.slice(0, -suffix.length) : clue;
}

// Exactly appendRefs's output: "14-Across" labels joined by ", " — anything
// looser (NYT's "17-, 25- and 43-Across", refs mid-sentence) is authored
// prose and stays in the text.
const LABEL_LIST_RE = /^\d+-(?:Across|Down)(?:, \d+-(?:Across|Down))*$/i;

/** Detect a clue whose refs exist only as appendRefs-style text — a draft
 *  saved before links were stored structurally, or a syndicated "See 5-Down"
 *  clue — and split them back apart. Returns null unless the text ends in
 *  exactly the generated format. */
export function splitGeneratedRefs(text: string): { clue: string; refs: ClueRef[] } | null {
  const m = /^(?:(.*) \(see ([^()]+)\)|[Ss]ee (.+))$/.exec(text);
  if (!m) return null;
  const refsText = m[2] ?? m[3];
  if (!LABEL_LIST_RE.test(refsText)) return null;
  const refs = refsText.split(", ").map((label) => {
    const [n, d] = label.split("-");
    return { number: Number(n), direction: d.toLowerCase() as Direction };
  });
  return { clue: m[1] ?? "", refs };
}

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
