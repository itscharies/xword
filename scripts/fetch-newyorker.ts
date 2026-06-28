// Fetch the New Yorker crosswords (the Mini and the full daily). Each date's
// page embeds a game UUID (games.newyorker.com?id=…); the puzzle itself comes
// from the Condé puzzles API as a markdown payload. No auth required.
//
// Run: npm run fetch:newyorker [days]   (default 21 days back)
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseNewYorker } from "./parse-newyorker.ts";
import { rebuildIndex, PUZZLE_DIR } from "./build-index.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";

const PAGE_BASE = "https://www.newyorker.com/puzzles-and-games-dept";
const API = "https://puzzles-games-api.gp-prod.conde.digital/api/v1/games";

// Both live at the same kind of URL and share the markdown payload format.
const KINDS: Array<{ source: PuzzleSource; slug: string }> = [
  { source: "tny-crossword", slug: "crossword" },
  { source: "tny-mini", slug: "mini-crossword" },
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Last `n` days as {ymd, y, m, d} (UTC), newest first. */
function recentDays(n: number) {
  const now = new Date();
  const out: Array<{ ymd: string; path: string }> = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    out.push({ ymd: `${y}${m}${d}`, path: `${y}/${m}/${d}` });
  }
  return out;
}

const DAYS = Number(process.argv[2]) || 21;

async function main(): Promise<void> {
  let added = 0;
  for (const { source, slug } of KINDS) {
    const dir = join(PUZZLE_DIR, source);
    await mkdir(dir, { recursive: true });
    for (const { ymd, path } of recentDays(DAYS)) {
      const file = join(dir, `${ymd}.json`);
      if (existsSync(file)) continue;
      try {
        const page = await fetchText(`${PAGE_BASE}/${slug}/${path}`);
        const id = page.match(/games\.newyorker\.com\?id=([0-9a-f-]{36})/)?.[1];
        if (!id) continue; // no puzzle of this kind that day
        const game = JSON.parse(await fetchText(`${API}/${id}`));
        if (!game?.data) continue;
        const puzzle = parseNewYorker(game.data, source, ymd);
        await writeFile(file, JSON.stringify(puzzle), "utf8");
        console.log(`  ${source} ${ymd} — ${puzzle.width}x${puzzle.height} by ${puzzle.author}`);
        added++;
      } catch (err) {
        console.error(`  ${source} ${ymd} — FAILED: ${(err as Error).message}`);
      }
      await sleep(400);
    }
  }

  const total = await rebuildIndex();
  console.log(`Done. ${added} new puzzle(s) added. Index has ${total}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
