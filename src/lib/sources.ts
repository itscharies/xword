// The puzzle collections the app pulls from. Each lives in its own folder
// under public/puzzles/<source>/ and carries a `source` tag in the index.

// Seattle Times publishes several AmuseLabs sets. The non-"large" daily set
// (seattletimes-crossword) is deactivated upstream (errorCode 115), but large,
// midi, and mini are live.
export type PuzzleSource =
  | "nyt"
  | "st-large"
  | "st-midi"
  | "st-mini"
  | "latimes"
  | "gdn-quick"
  | "gdn-cryptic"
  | "gdn-quiptic"
  | "gdn-quick-cryptic"
  | "gdn-prize"
  | "gdn-mini"
  | "tny-mini";

export interface SourceMeta {
  /** Full name, shown in the solver header and archive cards. */
  label: string;
  /** Publisher — drives the "Paper" filter. */
  paper: string;
  /** Coarse kind — drives the "Type" filter: Crossword, Mini, or Cryptic. */
  type: "Crossword" | "Mini" | "Cryptic";
}

export const SOURCES: Record<PuzzleSource, SourceMeta> = {
  nyt: { label: "NYT Crossword", paper: "NY Times", type: "Crossword" },
  latimes: { label: "LA Times Crossword", paper: "LA Times", type: "Crossword" },
  "st-large": {
    label: "Seattle Times Crossword",
    paper: "Seattle Times",
    type: "Crossword",
  },
  "st-midi": { label: "Seattle Times Midi", paper: "Seattle Times", type: "Crossword" },
  "st-mini": { label: "Seattle Times Mini", paper: "Seattle Times", type: "Mini" },
  "gdn-quick": { label: "Guardian Quick", paper: "Guardian", type: "Crossword" },
  "gdn-cryptic": { label: "Guardian Cryptic", paper: "Guardian", type: "Cryptic" },
  "gdn-quiptic": { label: "Guardian Quiptic", paper: "Guardian", type: "Cryptic" },
  "gdn-quick-cryptic": {
    label: "Guardian Quick Cryptic",
    paper: "Guardian",
    type: "Cryptic",
  },
  "gdn-prize": { label: "Guardian Prize", paper: "Guardian", type: "Cryptic" },
  "gdn-mini": { label: "Guardian Mini", paper: "Guardian", type: "Mini" },
  "tny-mini": { label: "New Yorker Mini", paper: "New Yorker", type: "Mini" },
};

/** Display + tie-break order when several puzzles share a date. The first
 * appearance of each `type` here also sets the Type filter order, so a Mini
 * source sits before the first Cryptic to land Mini between Crossword/Cryptic. */
export const SOURCE_ORDER: PuzzleSource[] = [
  "nyt",
  "latimes",
  "st-large",
  "st-midi",
  "st-mini",
  "gdn-quick",
  "gdn-cryptic",
  "gdn-quiptic",
  "gdn-quick-cryptic",
  "gdn-prize",
  "gdn-mini",
  "tny-mini",
];

/** Distinct papers / types in display order, for the archive filters. */
export const PAPERS: string[] = [
  ...new Set(SOURCE_ORDER.map((s) => SOURCES[s].paper)),
];
export const TYPES: string[] = [
  ...new Set(SOURCE_ORDER.map((s) => SOURCES[s].type)),
];

export function isSource(s: string): s is PuzzleSource {
  return (SOURCE_ORDER as string[]).includes(s);
}
