// The puzzle collections the app pulls from. Each lives in its own folder
// under public/puzzles/<source>/ and carries a `source` tag in the index.

// Seattle Times publishes several AmuseLabs sets. The non-"large" daily set
// (seattletimes-crossword) is deactivated upstream (errorCode 115), but large,
// midi, and mini are live.
export type PuzzleSource = "nyt" | "st-large" | "st-midi" | "st-mini";

export interface SourceMeta {
  /** Full name, shown in the solver header and archive cards. */
  label: string;
  /** Compact label for filter chips / badges. */
  short: string;
}

export const SOURCES: Record<PuzzleSource, SourceMeta> = {
  nyt: { label: "NY Times Syndicated", short: "NYT" },
  "st-large": { label: "Seattle Times Crossword", short: "Crossword" },
  "st-midi": { label: "Seattle Times Midi", short: "Midi" },
  "st-mini": { label: "Seattle Times Mini", short: "Mini" },
};

/** Display + tie-break order when several puzzles share a date. */
export const SOURCE_ORDER: PuzzleSource[] = [
  "nyt",
  "st-large",
  "st-midi",
  "st-mini",
];

export function isSource(s: string): s is PuzzleSource {
  return (SOURCE_ORDER as string[]).includes(s);
}
