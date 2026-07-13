// Self-healing for the AmuseLabs descrambler. The player re-keys its rawc
// scramble constants every week or so (2026-07-01, -08, -13 …), and each rev
// silently breaks every Seattle Times and LA Times fetch until the static
// port in parse-amuse.ts is updated by hand. Rather than lose a day of
// puzzles per rev, the fetchers call `ensureDescrambler` before parsing: if
// the current descramblers can't decode a payload, we pull the player's own
// c-min.js bundle, cut out the live descramble function, and run that.
//
// The extracted function is pure string/array shuffling with no free
// identifiers, so it's evaluated in an empty `node:vm` context (no require,
// no process, 1s timeout) and only installed once it has provably decoded
// the very payload that just failed. The extracted source is logged so the
// static port can be refreshed from the CI output.
import vm from "node:vm";
import { canDecodeRawc, installDescramble } from "./parse-amuse.ts";

/** Find the player bundle URL (c-min.js) referenced by a player page. */
export function bundleUrlFromHtml(html: string, pageUrl: string): string | null {
  const m = html.match(/src="([^"]*c-min\.js[^"]*)"/);
  return m ? new URL(m[1], pageUrl).href : null;
}

/**
 * Cut the descramble function's source out of a player bundle. It's the
 * helper passed alongside `flowName` inside the `isRawcEncoded` branch of
 * the rawc decode (named `Ol`/`Il`/`Pl` across past revs).
 */
export function descrambleSourceFromBundle(bundleJs: string): string | null {
  const anchor = bundleJs.indexOf("isRawcEncoded");
  if (anchor < 0) return null;
  const call = bundleJs
    .slice(anchor, anchor + 800)
    .match(/\(\s*\w+\s*,\s*\w+\.flowName\s*,\s*([A-Za-z_$][\w$]*)\s*\)/);
  if (!call) return null;
  const name = call[1];

  const decl = bundleJs.indexOf(`function ${name}(`);
  if (decl < 0) return null;
  // Balanced-brace scan, skipping string literals so a brace inside a quote
  // can't derail it. The known descramblers contain no strings at all, but
  // that isn't worth betting on.
  let depth = 0;
  let quote: string | null = null;
  for (let i = decl; i < bundleJs.length; i++) {
    const ch = bundleJs[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      if (--depth === 0) return bundleJs.slice(decl, i + 1);
    }
  }
  return null;
}

// One attempt per bundle URL per process — a bundle that failed to yield a
// working descrambler won't start working on the next puzzle either.
const attempted = new Set<string>();

/**
 * Make sure `rawc` is decodable before parsing, auto-porting the descrambler
 * from the live player bundle if the ones we have are stale. No-op when the
 * payload already decodes. Throws when healing is impossible (bundle missing,
 * extraction failed, or the extracted function still can't decode) — the
 * per-date catch in the fetchers reports it like any other failure.
 */
export async function ensureDescrambler(
  rawc: string,
  playerHtml: string,
  pageUrl: string,
): Promise<void> {
  if (canDecodeRawc(rawc)) return;

  const bundleUrl = bundleUrlFromHtml(playerHtml, pageUrl);
  if (!bundleUrl) throw new Error("descramble failed and no c-min.js bundle URL in page");
  if (attempted.has(bundleUrl)) throw new Error("descramble failed (bundle already tried)");
  attempted.add(bundleUrl);

  const res = await fetch(bundleUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`descramble failed and bundle fetch got HTTP ${res.status}`);
  const src = descrambleSourceFromBundle(await res.text());
  if (!src) throw new Error("descramble failed and no descrambler found in bundle");

  const fn = vm.runInNewContext(`(${src})`, {}, { timeout: 1000 }) as (s: string) => string;
  const decoded = Buffer.from(fn(rawc), "base64").toString("utf8");
  JSON.parse(decoded); // still throws if the extracted function is wrong too

  installDescramble(fn);
  console.warn(
    `  ! auto-ported a re-keyed descrambler from ${bundleUrl}\n` +
      `  ! update the static port in parse-amuse.ts from this source:\n  ${src}`,
  );
}
