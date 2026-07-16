// Build the fill-suggestion word list served to the /create builder.
//
// Source: Spread the Word(list) by Brooke Husic & Enrique Henestroza Anguiano
//   https://www.spreadthewordlist.com/  (uppercase + "Compiler" .dict format)
// Licence: CC BY-NC-SA 4.0 — this repo uses it in a free, non-commercial app
//   with attribution (shown in the builder), and redistributes this derived
//   list under the same licence. See public/wordlist.LICENSE.txt.
//
// The source is a `WORD;score` file (score 0–50 in coarse bands). The bands
// below 40 are mostly junk — misspellings, keyboard mash, dubious partials
// ("TRRBS;20", "EMMMA;30", "SNLUK;30") — with the quality cliff at 40, so we
// keep only 40+ entries (also roughly halving the served file). We likewise
// drop anything that isn't pure A–Z (a handful contain digits), then write
// the normalised list to public/wordlist.txt for the app to lazy-load.
//
// The builder trusts the list wholesale: autofill draws from every entry, and
// hand-typed words outside it get the unknown-word highlight.
//
// Usage: tsx scripts/build-wordlist.ts <path-to-stwl.dict>

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "wordlist.txt");
const MIN_SCORE = 40;

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("Pass the path to the STWL .dict file.");
  const raw = await readFile(src, "utf8");
  const out: string[] = [];
  let dropped = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z]+);(\d+)$/.exec(line.trim());
    if (!m) {
      if (line.trim()) dropped++;
      continue;
    }
    const score = Number(m[2]);
    if (score < MIN_SCORE) {
      dropped++;
      continue;
    }
    out.push(`${m[1]};${score}`);
  }
  await writeFile(OUT, out.join("\n") + "\n", "utf8");
  console.log(`wrote ${out.length} entries to ${OUT} (dropped ${dropped})`);
}

main();
