// The puzzle collections the app pulls from. Each lives in its own folder
// under public/puzzles/<source>/ and carries a `source` tag in the index.

// Seattle Times publishes several AmuseLabs sets. The non-"large" daily set
// (seattletimes-crossword) is deactivated upstream (errorCode 115), but large,
// midi, and mini are live.
export type PuzzleSource = "nyt" | "st-large" | "st-midi" | "st-mini";

export interface SourceMeta {
  /** Full name, shown in the solver header and archive cards. */
  label: string;
  /** Publisher — drives the "Paper" filter. */
  paper: string;
  /** Puzzle size/type — drives the "Size" filter. */
  size: string;
}

export const SOURCES: Record<PuzzleSource, SourceMeta> = {
  nyt: {
    label: "NY Times Syndicated",
    paper: "NY Times",
    size: "Crossword",
  },
  "st-large": {
    label: "Seattle Times Crossword",
    paper: "Seattle Times",
    size: "Crossword",
  },
  "st-midi": { label: "Seattle Times Midi", paper: "Seattle Times", size: "Midi" },
  "st-mini": { label: "Seattle Times Mini", paper: "Seattle Times", size: "Mini" },
};

/** Display + tie-break order when several puzzles share a date. */
export const SOURCE_ORDER: PuzzleSource[] = [
  "nyt",
  "st-large",
  "st-midi",
  "st-mini",
];

/** Distinct papers / sizes in display order, for the archive filters. */
export const PAPERS: string[] = [
  ...new Set(SOURCE_ORDER.map((s) => SOURCES[s].paper)),
];
export const SIZES: string[] = [
  ...new Set(SOURCE_ORDER.map((s) => SOURCES[s].size)),
];

export function isSource(s: string): s is PuzzleSource {
  return (SOURCE_ORDER as string[]).includes(s);
}
