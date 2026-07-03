// One-off backfill: import every public/puzzles/<source>/<date>.json into
// the syndicated_puzzles table so it becomes the canonical store instead of
// static files checked into git. Safe to re-run — upserts on the table's
// existing (source, puzzle_date) primary key.
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local (the write RLS policy on
// syndicated_puzzles is admin-only; this bypasses it deliberately, the same
// way the daily fetchers will going forward).
//
// Run: npx tsx scripts/migrate-puzzles-to-supabase.ts
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Puzzle } from "../src/types.ts";
import { SOURCE_ORDER } from "../src/lib/sources.ts";
import { PUZZLE_DIR } from "./build-index.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { buildSyndicatedRow } from "./puzzleStore.ts";

const BATCH_SIZE = 50;

async function main(): Promise<void> {
  const rows: ReturnType<typeof buildSyndicatedRow>[] = [];
  const failures: string[] = [];

  for (const source of SOURCE_ORDER) {
    const dir = join(PUZZLE_DIR, source);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => /\.json$/.test(f));
    for (const f of files) {
      try {
        const p: Puzzle = JSON.parse(await readFile(join(dir, f), "utf8"));
        rows.push(buildSyndicatedRow(source, p));
      } catch (err) {
        failures.push(`${source}/${f}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`Read ${rows.length} puzzle(s) from disk, upserting in batches of ${BATCH_SIZE}...`);

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from("syndicated_puzzles")
      .upsert(batch, { onConflict: "source,puzzle_date" });
    if (error) {
      failures.push(`batch ${i / BATCH_SIZE}: ${error.message}`);
      continue;
    }
    upserted += batch.length;
    console.log(`  ${upserted}/${rows.length}`);
  }

  console.log(`Done. ${upserted}/${rows.length} upserted.`);
  if (failures.length > 0) {
    console.error(`${failures.length} failure(s):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
