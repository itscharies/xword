// Per-puzzle solve progress persisted to localStorage, keyed by date.

export interface Progress {
  /** User-entered letters, one per cell (row-major). "" = empty. */
  entries: string[][];
  /** "row,col" keys of cells whose letters were revealed. */
  revealed: string[];
  /** Elapsed solving time in seconds. */
  elapsed: number;
  completed: boolean;
  /** Open cells filled, and total open cells — for the archive % badge. */
  filled?: number;
  total?: number;
  /** Self-rating 1–5, set on completion. */
  rating?: number;
}

import type { PuzzleSource } from "./sources.ts";

const key = (source: PuzzleSource, date: string) =>
  `xword:progress:${source}:${date}`;

export function loadProgress(
  source: PuzzleSource,
  date: string,
): Progress | null {
  try {
    let raw = localStorage.getItem(key(source, date));
    // Migrate pre-multi-source NYT progress, which was keyed by bare date.
    if (!raw && source === "nyt") {
      const legacy = localStorage.getItem(`xword:progress:${date}`);
      if (legacy) {
        localStorage.setItem(key(source, date), legacy);
        localStorage.removeItem(`xword:progress:${date}`);
        raw = legacy;
      }
    }
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function saveProgress(
  source: PuzzleSource,
  date: string,
  progress: Progress,
): void {
  try {
    localStorage.setItem(key(source, date), JSON.stringify(progress));
  } catch {
    // Storage full or unavailable — solving still works in-memory.
  }
}

export function clearProgress(source: PuzzleSource, date: string): void {
  try {
    localStorage.removeItem(key(source, date));
  } catch {
    /* ignore */
  }
}

const LAST_DATE_KEY = "xword:lastDate";

export function loadLastDate(): string | null {
  try {
    return localStorage.getItem(LAST_DATE_KEY);
  } catch {
    return null;
  }
}

export function saveLastDate(date: string): void {
  try {
    localStorage.setItem(LAST_DATE_KEY, date);
  } catch {
    /* ignore */
  }
}

// ---- crossword builder (/create) draft ----------------------------------

import type { Cell, Direction } from "../types.ts";

/** The full editable state of the builder, autosaved so a draft survives a
 *  reload or revisit. `clueText` is the Map serialized as entries. */
export interface BuilderDraft {
  width: number;
  height: number;
  linked: boolean;
  symmetry: boolean;
  cryptic: boolean;
  autoEnumerate: boolean;
  grid: Cell[][];
  clueText: [string, string][];
  /** Cross-references: source slot key -> target slot keys, as Map entries. */
  links: [string, string[]][];
  active: { row: number; col: number };
  direction: Direction;
  mode: "paint" | "fill";
  title: string;
  author: string;
  editor: string;
  date: string;
}

const BUILDER_KEY = "xword:builder-draft";

export function loadBuilderDraft(): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(BUILDER_KEY);
    return raw ? (JSON.parse(raw) as BuilderDraft) : null;
  } catch {
    return null;
  }
}

export function saveBuilderDraft(draft: BuilderDraft): void {
  try {
    localStorage.setItem(BUILDER_KEY, JSON.stringify(draft));
  } catch {
    // Storage full or unavailable — editing still works in-memory.
  }
}

export function clearBuilderDraft(): void {
  try {
    localStorage.removeItem(BUILDER_KEY);
  } catch {
    /* ignore */
  }
}

const ZOOM_KEY = "xword:zoom";
export type ZoomMode = "fit" | "scroll";

export function loadZoomMode(): ZoomMode {
  try {
    return localStorage.getItem(ZOOM_KEY) === "scroll" ? "scroll" : "fit";
  } catch {
    return "fit";
  }
}

export function saveZoomMode(mode: ZoomMode): void {
  try {
    localStorage.setItem(ZOOM_KEY, mode);
  } catch {
    /* ignore */
  }
}
