export type Mode = "light" | "dark" | "system";

/** Selectable bright accent colours (kept in sync with [data-accent] in CSS). */
export const ACCENTS = [
  { id: "red", label: "Red", swatch: "#ff4d4d" },
  { id: "orange", label: "Orange", swatch: "#ff7a00" },
  { id: "yellow", label: "Yellow", swatch: "#ffe500" },
  { id: "lime", label: "Lime", swatch: "#3cff52" },
  { id: "green", label: "Green", swatch: "#22c55e" },
  { id: "cyan", label: "Cyan", swatch: "#00e5ff" },
  { id: "blue", label: "Blue", swatch: "#3b82ff" },
  { id: "indigo", label: "Indigo", swatch: "#8a5cff" },
  { id: "violet", label: "Violet", swatch: "#cf5cff" },
  { id: "pink", label: "Pink", swatch: "#ff2d8e" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

/** Swatch hex for an accent id — avatars and multiplayer cursors resolve a
 *  profile's stored accent through this. */
export function accentSwatch(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.swatch ?? ACCENTS[0].swatch;
}

const THEME_KEY = "xword:theme";
const ACCENT_KEY = "xword:accent";

const root = () => document.documentElement;

const prefersDark = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-color-scheme: dark)").matches;

/** Resolve a mode preference to the concrete theme to apply to data-theme. */
const resolve = (mode: Mode): "light" | "dark" =>
  mode === "system" ? (prefersDark() ? "dark" : "light") : mode;

/** The stored preference: "light", "dark", or "system" (follow the OS). */
export function getMode(): Mode {
  try {
    const m = localStorage.getItem(THEME_KEY);
    if (m === "light" || m === "dark" || m === "system") return m;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function setMode(mode: Mode): void {
  root().dataset.theme = resolve(mode);
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
}

let themeWatched = false;
/** In "system" mode, track the OS colour scheme and re-apply when it flips. */
export function initTheme(): void {
  if (themeWatched || typeof matchMedia === "undefined") return;
  themeWatched = true;
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (getMode() === "system") root().dataset.theme = e.matches ? "dark" : "light";
  });
}

export function getAccent(): AccentId {
  return (root().dataset.accent as AccentId) || "yellow";
}

/** Paint an accent (attribute + favicon) without touching the saved
 *  signed-out preference — profile-driven accents ride through here. */
export function applyAccent(accent: AccentId): void {
  root().dataset.accent = accent;
  updateFavicon();
}

/** The stored signed-out accent. Signed-in users' accents come from their
 *  profile instead (AppRoutes syncs [data-accent] from it), so this is what
 *  the page falls back to after signing out. */
export function getLocalAccent(): AccentId {
  try {
    const a = localStorage.getItem(ACCENT_KEY);
    if (ACCENTS.some((x) => x.id === a)) return a as AccentId;
  } catch {
    /* ignore */
  }
  return "yellow";
}

/** Save the signed-out accent preference (and paint it). */
export function setAccent(accent: AccentId): void {
  applyAccent(accent);
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
}

/** Redraw the favicon (the highlighted-word mark) in the current accent colour,
 * read live from the applied CSS variables, as an inline data-URI. */
export function updateFavicon(): void {
  const cs = getComputedStyle(root());
  const active = cs.getPropertyValue("--accent").trim() || "#ffe500";
  const word = cs.getPropertyValue("--accent-deep").trim() || active;
  const OPEN = "#ededed";
  const BLOCK = "#000000";
  const BG = "#1c1c1c";
  const p = [0, 11, 22];
  const cell = (x: number, y: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="10" height="10" fill="${fill}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="${BG}"/>` +
    // A "T" (for "The"): highlighted word across the top, white stem down the
    // middle, the active square at the top centre.
    cell(p[0], p[0], word) + cell(p[1], p[0], active) + cell(p[2], p[0], word) +
    cell(p[0], p[1], BLOCK) + cell(p[1], p[1], OPEN) + cell(p[2], p[1], BLOCK) +
    cell(p[0], p[2], BLOCK) + cell(p[1], p[2], OPEN) + cell(p[2], p[2], BLOCK) +
    `</svg>`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}

const ADVANCE_KEY = "xword:autoAdvance";

/** When on, finishing the last letter of a word jumps to the next open clue. */
export function getAutoAdvance(): boolean {
  try {
    return localStorage.getItem(ADVANCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoAdvance(on: boolean): void {
  try {
    localStorage.setItem(ADVANCE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

// Navigation rules that used to be hard-coded in useCrossword.ts — each
// defaults to the old behaviour (on), so existing solvers notice nothing
// until they opt out.

const SKIP_FILLED_KEY = "xword:skipFilledSquares";

/** When on (default), typing hops over squares that already have a letter. */
export function getSkipFilledSquares(): boolean {
  try {
    return localStorage.getItem(SKIP_FILLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSkipFilledSquares(on: boolean): void {
  try {
    localStorage.setItem(SKIP_FILLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const BACKFILL_KEY = "xword:backfillGaps";

/** When on (default), running out of empty squares ahead of the cursor jumps
 *  back to the word's first blank instead of parking on filled letters. */
export function getBackfillGaps(): boolean {
  try {
    return localStorage.getItem(BACKFILL_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setBackfillGaps(on: boolean): void {
  try {
    localStorage.setItem(BACKFILL_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const SKIP_DONE_CLUES_KEY = "xword:skipFilledClues";

/** When on (default), moving between clues (Tab, the banner arrows, and the
 *  auto-advance jump) passes over clues whose every square is filled. */
export function getSkipFilledClues(): boolean {
  try {
    return localStorage.getItem(SKIP_DONE_CLUES_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSkipFilledClues(on: boolean): void {
  try {
    localStorage.setItem(SKIP_DONE_CLUES_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const GRID_FIT_KEY = "xword:gridFit";

/** "width" (default) sizes the grid to fit the screen, like today. "canvas"
 *  keeps cells at their full --min-cell size and turns the grid area into a
 *  pan/zoomable canvas — see GridCanvas.tsx and the `[data-grid-fit="canvas"]`
 *  rules in index.css. ("fixed", the old scroll-the-board mode canvas
 *  replaces, reads back as "canvas"; index.html's pre-paint script does the
 *  same mapping.) */
export type GridFit = "width" | "canvas";

/** Unlike the other settings (pure CSS via the dataset), grid fit swaps which
 *  component the solver renders, so changes need to reach React — see
 *  useGridFit.ts. */
const gridFitListeners = new Set<() => void>();

export function subscribeGridFit(fn: () => void): () => void {
  gridFitListeners.add(fn);
  return () => gridFitListeners.delete(fn);
}

export function getGridFit(): GridFit {
  try {
    const v = localStorage.getItem(GRID_FIT_KEY);
    return v === "canvas" || v === "fixed" ? "canvas" : "width";
  } catch {
    return "width";
  }
}

export function setGridFit(fit: GridFit): void {
  root().dataset.gridFit = fit;
  try {
    localStorage.setItem(GRID_FIT_KEY, fit);
  } catch {
    /* ignore */
  }
  gridFitListeners.forEach((fn) => fn());
}

const FILTER_KEY = "xword:filters";

export interface Filters {
  /** The Sources row: paper names from lib/sources.ts's PAPERS plus the
   *  community chips (Archive.tsx's FOLLOWING_CHIP / MINE_CHIP) —
   *  multi-select; empty means no filter (everything shows). Still keyed
   *  "papers" so selections persisted before the community chips joined
   *  the row keep working. */
  papers: string[];
  /** Same idea for lib/sources.ts's TYPES (Crossword/Mini/Cryptic). */
  types: string[];
  /** "Complete" / "In progress" / "Not started" — multi-select. */
  progress: string[];
}

/** The archive's last-used filters, so they survive navigation. */
export function getFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    const f = raw ? (JSON.parse(raw) as Partial<Filters>) : {};
    return {
      papers: Array.isArray(f.papers) ? f.papers : [],
      types: Array.isArray(f.types) ? f.types : [],
      progress: Array.isArray(f.progress) ? f.progress : [],
    };
  } catch {
    return { papers: [], types: [], progress: [] };
  }
}

export function setFilters(f: Filters): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}
