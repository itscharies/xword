// Rebuild public/puzzles/index.json from every <source>/<date>.json on disk,
// sorted newest-first with a stable per-source tie-break. Shared by both
// fetchers so a run of either keeps the index complete.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Puzzle, PuzzleIndexEntry } from "../src/types.ts";
import { SOURCE_ORDER } from "../src/lib/sources.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PUZZLE_DIR = join(__dirname, "..", "public", "puzzles");

export async function rebuildIndex(): Promise<number> {
  const entries: PuzzleIndexEntry[] = [];
  for (const source of SOURCE_ORDER) {
    const dir = join(PUZZLE_DIR, source);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => /\.json$/.test(f));
    for (const f of files) {
      const p: Puzzle = JSON.parse(await readFile(join(dir, f), "utf8"));
      entries.push({
        source,
        date: p.date,
        isoDate: p.isoDate,
        weekday: p.weekday,
        title: p.title,
        author: p.author,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? 1 : -1;
    return SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);
  });

  await writeFile(
    join(PUZZLE_DIR, "index.json"),
    JSON.stringify(entries, null, 2),
    "utf8",
  );
  return entries.length;
}
