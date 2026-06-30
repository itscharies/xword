// One-off: move the trailing word-length enumeration out of each Guardian
// clue's text into a separate `enumeration` field, matching parse-guardian.ts.
// Re-running is safe — clues already split (no trailing enumeration) are left
// alone. Run: tsx scripts/migrate-enumeration.ts
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { splitEnumeration } from "../src/lib/enumeration.ts";
import type { Puzzle } from "../src/types.ts";
import { PUZZLE_DIR } from "./build-index.ts";

const GUARDIAN_SOURCES = [
  "gdn-quick",
  "gdn-cryptic",
  "gdn-quiptic",
  "gdn-quick-cryptic",
  "gdn-prize",
  "gdn-mini",
];

async function main(): Promise<void> {
  let files = 0;
  let changed = 0;
  for (const source of GUARDIAN_SOURCES) {
    const dir = join(PUZZLE_DIR, source);
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    } catch {
      continue; // source has no puzzles yet
    }
    for (const name of names) {
      const path = join(dir, name);
      const puzzle: Puzzle = JSON.parse(await readFile(path, "utf8"));
      let touched = false;
      for (const dir of ["across", "down"] as const) {
        for (const clue of puzzle.clues[dir]) {
          if (clue.enumeration) continue; // already migrated
          const { clue: text, enumeration } = splitEnumeration(clue.clue);
          if (!enumeration) continue;
          clue.clue = text;
          clue.enumeration = enumeration;
          touched = true;
        }
      }
      files++;
      if (touched) {
        await writeFile(path, JSON.stringify(puzzle), "utf8");
        changed++;
      }
    }
  }
  console.log(`Scanned ${files} Guardian puzzle(s); updated ${changed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
