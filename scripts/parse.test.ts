// Lightweight assertion script (run: npm run parse:test).
// Fetches the live 260627 puzzle and checks the parser invariants.
import { parsePuzzle } from "./parse.ts";

const URL =
  "https://nytsyn.pzzl.com/nytsyn-crossword-mh/nytsyncrossword?date=260627";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

const raw = await fetch(URL).then((r) => r.text());
const p = parsePuzzle(raw, "260627");

assert(p.width === 15 && p.height === 15, "grid is 15x15");
assert(p.clues.across.length === 31, "31 across clues");
assert(p.clues.down.length === 31, "31 down clues");
assert(p.isoDate === "2026-06-27", "isoDate is 2026-06-27");
assert(p.weekday === "Sat", "weekday is Sat");

assert(
  p.clues.down[0].answer === "BADEGGS",
  `Down #1 answer is BADEGGS (got ${p.clues.down[0].answer})`,
);
assert(p.clues.across[0].answer === "BARBETS", "Across #1 answer is BARBETS");
assert(p.clues.down[0].clue === "No-goodniks", "Down #1 clue is No-goodniks");
assert(
  p.author === "Kameron Austin Collins" && p.editor === "Will Shortz",
  "author/editor split correctly",
);

console.log("\nAll parser checks passed.");
