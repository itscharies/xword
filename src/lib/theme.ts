export type Mode = "light" | "dark";

/** Selectable bright accent colours (kept in sync with [data-accent] in CSS). */
export const ACCENTS = [
  { id: "yellow", label: "Yellow", swatch: "#ffe500" },
  { id: "cyan", label: "Cyan", swatch: "#00e5ff" },
  { id: "pink", label: "Pink", swatch: "#ff2d8e" },
  { id: "lime", label: "Lime", swatch: "#3cff52" },
  { id: "orange", label: "Orange", swatch: "#ff7a00" },
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
