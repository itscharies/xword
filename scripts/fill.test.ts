// Checks for the builder's autofill search (src/lib/fillSearch.ts), run
// against the real word list: `npm run fill:test`.

import { readFileSync } from "node:fs";
import { parseWordlist } from "../src/lib/wordlist.ts";
import { fillSearch } from "../src/lib/fillSearch.ts";
import type { FillSolution, SlotSpec } from "../src/lib/autofill.ts";

const buckets = parseWordlist(
  readFileSync(new URL("../public/wordlist.txt", import.meta.url), "utf8"),
);
const words = new Set<string>();
for (const arr of buckets.values()) for (const s of arr) words.add(s.word);

/** Slots of a grid drawn as rows: "#" block, "." open, a letter typed in.
 *  `cursor` marks the across slot starting at [row, col] as preferred. */
function slotsOf(rows: string[], cursor?: [number, number]): SlotSpec[] {
  const out: SlotSpec[] = [];
  const at = (r: number, c: number) => rows[r]?.[c] ?? "#";
  const cell = (r: number, c: number) => ({
    key: `${r},${c}`,
    letters: at(r, c) === "." ? "" : at(r, c),
  });
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[0].length; c++) {
      if (at(r, c) === "#") continue;
      if (at(r, c - 1) === "#" && at(r, c + 1) !== "#") {
        const cells = [];
        for (let k = c; at(r, k) !== "#"; k++) cells.push(cell(r, k));
        const preferred = !!cursor && cursor[0] === r && cursor[1] === c;
        out.push(preferred ? { cells, preferred } : { cells });
      }
      if (at(r - 1, c) === "#" && at(r + 1, c) !== "#") {
        const cells = [];
        for (let k = r; at(k, c) !== "#"; k++) cells.push(cell(k, c));
        out.push({ cells });
      }
    }
  return out;
}

function run(slots: SlotSpec[], maxSolutions: number, backjump = true) {
  const fills: FillSolution[] = [];
  const search = fillSearch(buckets, {
    slots,
    seed: 7,
    maxSolutions,
    backjump,
    onSolution: (s) => fills.push(s),
  });
  for (;;) {
    const step = search.next();
    if (step.done) return { fills, ...step.value };
  }
}

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

/** Every slot a distinct real word that keeps the typed letters. */
function valid(slots: SlotSpec[], fill: FillSolution): boolean {
  const seen = new Set<string>();
  for (const s of slots) {
    const w = s.cells.map((c) => c.letters || fill[c.key]).join("");
    if (!words.has(w) || seen.has(w)) return false;
    seen.add(w);
  }
  return true;
}

{
  const slots = slotsOf(Array(5).fill("....."), [0, 0]);
  const r = run(slots, 50);
  check("open 5x5: 50 valid fills", r.fills.length === 50 && r.fills.every((f) => valid(slots, f)));
  const firsts = new Set(r.fills.map((f) => [0, 1, 2, 3, 4].map((c) => f[`0,${c}`]).join("")));
  check("open 5x5: each fill tries a different word at the cursor", firsts.size === 50);
}
{
  const slots = slotsOf(["..T..", ".....", "E...S", ".....", "..A.."]);
  const r = run(slots, 5);
  check("typed letters are kept", r.fills.length > 0 && r.fills.every((f) => valid(slots, f)));
}
{
  const r = run(slotsOf(["QZ...", ".....", ".....", ".....", "....."]), 5);
  check("contradictory grid: definitive no-fill without searching", !r.fills.length && r.exhausted && r.nodes === 0);
}
{
  // Small enough to cover completely: the search must end by itself, with
  // every fill it reported valid.
  const slots = slotsOf(["RA..", "....", "....", "..ED"]);
  const r = run(slots, 1e9);
  const plain = run(slots, 1e9, false);
  check(
    "small grid: runs to exhaustion, backjumping changes nothing",
    r.exhausted && plain.exhausted && r.fills.length === plain.fills.length && r.fills.every((f) => valid(slots, f)),
    `${r.fills.length} fills`,
  );
}
{
  // The reason the starting slot used to matter: an easy region the cursor
  // is in, and a separate region with no fill (which takes real search to
  // prove). The proof must not be repeated per word of the cursor's slot.
  const hard = ["...L..", "......", "....G.", "....D.", "A.....", "......"];
  const alone = run(slotsOf(hard), 5);
  check("hard region: no fill, and it takes a search to see it", !alone.fills.length && alone.exhausted && alone.nodes > 1000);
  const both = run(slotsOf([...Array(6).fill("......"), "######", ...hard], [0, 0]), 5);
  check(
    "impossible region far from the cursor: still a prompt, definitive no-fill",
    !both.fills.length && both.exhausted && both.nodes < alone.nodes * 4,
    `${both.nodes} words tried vs ${alone.nodes} for the region alone`,
  );
}

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
