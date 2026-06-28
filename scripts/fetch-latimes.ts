// Fetch the LA Times daily crossword via Andrews McMeel's "puzzle society" API
// (the same feed the Seattle Times embeds for free). The subscription-id below
// is the public embed token from that page — it authenticates the API with no
// login, so it's treated as a fixed config value, not a secret.
//
// Run: npm run fetch:latimes
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseUclick } from "./parse-uclick.ts";
import { rebuildIndex, PUZZLE_DIR } from "./build-index.ts";

const API = "https://gghf7p46pk.execute-api.us-east-1.amazonaws.com/staging";
const SUBSCRIPTION_ID = "6057fc50-77aa-11f0-a16d-0333d2e36b4f";
const FEATURE_ID = "baee2c90-7c4a-11ef-b7a7-25e6a64242bb"; // "LA Times Crossword"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "subscription-id": SUBSCRIPTION_ID } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

interface GamesResponse {
  gameLevelDataSets?: Array<{
    issueDate: string;
    files: Array<{ url: string }>;
  }>;
}

async function main(): Promise<void> {
  const dir = join(PUZZLE_DIR, "latimes");
  await mkdir(dir, { recursive: true });

  const games: GamesResponse = JSON.parse(
    await fetchText(`${API}/client/features/${FEATURE_ID}/games`),
  );
  const sets = games.gameLevelDataSets ?? [];
  console.log(`LA Times feed returned ${sets.length} date(s).`);

  let added = 0;
  for (const set of sets) {
    const ymd = set.issueDate.slice(0, 10).replace(/-/g, "");
    const file = join(dir, `${ymd}.json`);
    if (existsSync(file)) continue;
    const url = set.files?.[0]?.url;
    if (!url) continue;
    try {
      const xml = await fetchText(url);
      const puzzle = parseUclick(xml, "latimes", ymd);
      await writeFile(file, JSON.stringify(puzzle), "utf8");
      console.log(`  latimes ${ymd} — ${puzzle.width}x${puzzle.height} by ${puzzle.author}`);
      added++;
    } catch (err) {
      console.error(`  latimes ${ymd} — FAILED: ${(err as Error).message}`);
    }
    await sleep(300);
  }

  const total = await rebuildIndex();
  console.log(`Done. ${added} new puzzle(s) added. Index has ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
