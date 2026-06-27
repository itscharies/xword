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
