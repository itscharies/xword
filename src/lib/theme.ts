export type Mode = "light" | "dark";

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

const THEME_KEY = "xword:theme";
const ACCENT_KEY = "xword:accent";

const root = () => document.documentElement;

export function getMode(): Mode {
  return root().dataset.theme === "light" ? "light" : "dark";
}

export function setMode(mode: Mode): void {
  root().dataset.theme = mode;
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function getAccent(): AccentId {
  return (root().dataset.accent as AccentId) || "yellow";
}

export function setAccent(accent: AccentId): void {
  root().dataset.accent = accent;
  try {
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
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

const FILTER_KEY = "xword:filters";

export interface Filters {
  paper: string;
  type: string;
}

/** The archive's last-used Paper/Type filters, so they survive navigation. */
export function getFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    const f = raw ? (JSON.parse(raw) as Partial<Filters>) : {};
    return { paper: f.paper ?? "all", type: f.type ?? "all" };
  } catch {
    return { paper: "all", type: "all" };
  }
}

export function setFilters(f: Filters): void {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}
