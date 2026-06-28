import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";
import { SOURCES } from "../src/lib/sources.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

interface GuardianEntry {
  number: number;
  clue: string;
  direction: "across" | "down";
  length: number;
  position: { x: number; y: number };
  solution?: string;
  /** Word breaks within the answer, e.g. {"-":[4]} or {",":[4,9]}. */
  separatorLocations?: Record<string, number[]>;
}
interface GuardianCrossword {
  name?: string;
  date?: number;
  pdf?: string;
  creator?: { name?: string };
  dimensions: { cols: number; rows: number };
  entries: GuardianEntry[];
}

/** The crossword object is nested somewhere in the page's JSON model. */
function findCrossword(o: unknown): GuardianCrossword | null {
  if (Array.isArray(o)) {
    for (const v of o) {
      const r = findCrossword(v);
      if (r) return r;
    }
  } else if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>;
    if (rec.entries && rec.dimensions) return rec as unknown as GuardianCrossword;
    for (const v of Object.values(rec)) {
      const r = findCrossword(v);
      if (r) return r;
    }
  }
  return null;
}

/** Parse a Guardian crossword `.json` page model into our Puzzle shape. */
export function parseGuardian(jsonText: string, source: PuzzleSource): Puzzle {
  const cw = findCrossword(JSON.parse(jsonText));
  if (!cw) throw new Error("no crossword data in page");

  const w = cw.dimensions.cols;
  const h = cw.dimensions.rows;

  // Start fully black, then carve out the cells covered by clue entries.
  const grid: Cell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ black: true }) as Cell),
  );

  for (const e of cw.entries) {
    const sol = String(e.solution ?? "");
    for (let i = 0; i < e.length; i++) {
      const r = e.direction === "down" ? e.position.y + i : e.position.y;
      const c = e.direction === "across" ? e.position.x + i : e.position.x;
      const cell = grid[r]?.[c];
      if (!cell) continue;
      delete cell.black;
      cell.solution = (sol[i] ?? "").toUpperCase();
    }
    const start = grid[e.position.y]?.[e.position.x];
    if (start) start.number = e.number;

    // Multi-word answers: mark a thick bar on the trailing edge of the letter
    // before each separator (in this entry's direction).
    for (const positions of Object.values(e.separatorLocations ?? {})) {
      for (const pos of positions) {
        if (pos <= 0 || pos >= e.length) continue;
        const r = e.direction === "down" ? e.position.y + pos - 1 : e.position.y;
        const c = e.direction === "across" ? e.position.x + pos - 1 : e.position.x;
        const cell = grid[r]?.[c];
        if (!cell || cell.black) continue;
        if (e.direction === "across") cell.barRight = true;
        else cell.barBottom = true;
      }
    }
  }

  const across: Clue[] = [];
  const down: Clue[] = [];
  for (const e of cw.entries) {
    if (!e.clue) continue; // grouped multi-part answers repeat with empty clues
    const clue: Clue = {
      number: e.number,
      clue: e.clue,
      answer: String(e.solution ?? "").toUpperCase(),
      row: e.position.y,
      col: e.position.x,
      len: e.length,
    };
    (e.direction === "across" ? across : down).push(clue);
  }
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);

  // Prefer the date baked into the PDF filename (gdn.<type>.YYYYMMDD.pdf) — it
  // matches the UK publication day without timezone drift.
  const pdfYmd = cw.pdf?.match(/\.(\d{8})\.pdf/)?.[1];
  const ymd = pdfYmd ?? new Date(cw.date ?? 0).toISOString().slice(0, 10).replace(/-/g, "");
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

  return {
    source,
    date: ymd,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title: SOURCES[source].label,
    author: cw.creator?.name ?? "The Guardian",
    editor: "",
    width: w,
    height: h,
    grid,
    clues: { across, down },
  };
}
