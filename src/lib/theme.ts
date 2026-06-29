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
  updateFavicon();
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
    cell(p[0], p[0], BLOCK) + cell(p[1], p[0], OPEN) + cell(p[2], p[0], BLOCK) +
    cell(p[0], p[1], word) + cell(p[1], p[1], active) + cell(p[2], p[1], word) +
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
