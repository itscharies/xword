// Cryptic (and Guardian quick) clues carry a word-length enumeration in
// parentheses at the end of the clue text, e.g. "… almost? (4,5)". We store
// that as a separate `enumeration` field rather than baked into the clue
// string, and re-render it after the clue.

// A trailing parenthetical made up only of enumeration characters and starting
// with a digit — so it matches "(4,5)", "(7)", "(4-3)", "(3,2,4)" but not a
// cross-reference like "(see 1)" or any clue that just happens to end in prose.
const ENUM_RE = /\s*\(([0-9][0-9,\-–.\s']*)\)\s*$/;

/** Split a clue into its text and trailing enumeration (sans parentheses).
 * Returns the clue unchanged with no enumeration when there's no match. */
export function splitEnumeration(clue: string): {
  clue: string;
  enumeration?: string;
} {
  const m = clue.match(ENUM_RE);
  if (m?.index === undefined) return { clue };
  return { clue: clue.slice(0, m.index).trimEnd(), enumeration: m[1].trim() };
}
