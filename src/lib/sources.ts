// The puzzle collections the app pulls from. Each lives in its own folder
// under public/puzzles/<source>/ and carries a `source` tag in the index.

// Note: the Seattle Times "regular" AmuseLabs set (seattletimes-crossword) is
// deactivated upstream (errorCode 115), so only the large-print set is pulled.
export type PuzzleSource = "nyt" | "st-large";

export interface SourceMeta {
  /** Full name, shown in the solver header and archive cards. */
  label: string;
  /** Compact label for filter chips / badges. */
  short: string;
}

export const SOURCES: Record<PuzzleSource, SourceMeta> = {
  nyt: { label: "NY Times Syndicated", short: "NYT" },
  "st-large": { label: "Seattle Times Crossword", short: "Seattle Times" },
};

/** Display + tie-break order when several puzzles share a date. */
export const SOURCE_ORDER: PuzzleSource[] = ["nyt", "st-large"];

export function isSource(s: string): s is PuzzleSource {
  return s === "nyt" || s === "st-large";
}
