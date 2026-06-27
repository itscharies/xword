// Per-puzzle solve progress persisted to localStorage, keyed by date.

export interface Progress {
  /** User-entered letters, one per cell (row-major). "" = empty. */
  entries: string[][];
  /** "row,col" keys of cells whose letters were revealed. */
  revealed: string[];
  /** Elapsed solving time in seconds. */
  elapsed: number;
  completed: boolean;
}

const key = (date: string) => `xword:progress:${date}`;

export function loadProgress(date: string): Progress | null {
  try {
    const raw = localStorage.getItem(key(date));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function saveProgress(date: string, progress: Progress): void {
  try {
    localStorage.setItem(key(date), JSON.stringify(progress));
  } catch {
    // Storage full or unavailable — solving still works in-memory.
  }
}

export function clearProgress(date: string): void {
  try {
    localStorage.removeItem(key(date));
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
