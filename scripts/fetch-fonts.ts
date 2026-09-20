// Downloads self-hosted copies of the app's two Google Fonts (SN Pro, Jaro)
// into public/fonts/, and writes public/fonts/fonts.css with local
// @font-face rules. Replaces the cross-origin Google Fonts <link> tags that
// used to live in index.html — a cross-origin font can't be listed in the
// service worker's precache manifest the way same-origin assets can (see
// public/sw.js), so runtime-caching them opportunistically was the fallback,
// but that only helps once a font has actually been fetched once; hosting
// them ourselves means they're precached with everything else and guaranteed
// to work offline from the very first cold boot.
//
// Latin subset only — this is an English-language crossword app, and
// dropping the cyrillic/vietnamese/greek/etc. subsets Google Fonts also
// serves keeps the precached footprint small. Re-run if a new weight or
// family is ever needed: `npm run fetch:fonts`.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, "..", "public", "fonts");

const FAMILIES = [
  "SN+Pro:wght@200;300;400;500;600;700;800",
  "Jaro:opsz@6..72",
];

// Google Fonts only serves woff2 (what we want, smallest) to a UA it
// recognizes as a modern browser — curl's default UA gets old TTF/EOT.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface FontFace {
  family: string;
  weight: string;
  style: string;
  url: string;
}

/** Google's css2 response is one @font-face block per (weight, subset), each
 *  preceded by a comment naming its subset — keep only "latin". */
function parseLatinFaces(css: string, family: string): FontFace[] {
  const parts = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1); // [subset, block, subset, block, ...]
  const faces: FontFace[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i] !== "latin") continue;
    const block = parts[i + 1];
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1] ?? "400";
    const style = block.match(/font-style:\s*(\w+)/)?.[1] ?? "normal";
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    if (url) faces.push({ family, weight, style, url });
  }
  return faces;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function downloadFile(family: string, url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const filename = `${family.replace(/\s+/g, "-").toLowerCase()}.woff2`;
  writeFileSync(join(fontsDir, filename), buf);
  return filename;
}

async function main() {
  mkdirSync(fontsDir, { recursive: true });

  const allFaces: FontFace[] = [];
  for (const family of FAMILIES) {
    const [name] = family.split(":");
    const css = await fetchText(`https://fonts.googleapis.com/css2?family=${family}&display=swap`);
    allFaces.push(...parseLatinFaces(css, name.replace(/\+/g, " ")));
  }

  // Both these families are variable fonts: Google's response maps every
  // requested static weight to the *same* underlying file (confirmed by
  // hash — SN Pro's 7 weight declarations are all byte-identical). Group by
  // (family, style, url) so that collapses into one @font-face per group,
  // downloaded once, with a weight *range* rather than 7 duplicate copies of
  // the same file and 7 near-identical rules.
  const byFile = new Map<string, FontFace[]>();
  for (const face of allFaces) {
    const key = `${face.family}|${face.style}|${face.url}`;
    const group = byFile.get(key);
    if (group) group.push(face);
    else byFile.set(key, [face]);
  }

  const rules: string[] = [];
  for (const group of byFile.values()) {
    const { family, style, url } = group[0];
    const weights = group.map((f) => Number(f.weight)).sort((a, b) => a - b);
    const weightDecl = weights.length > 1 ? `${weights[0]} ${weights.at(-1)}` : `${weights[0]}`;
    const filename = await downloadFile(family, url);
    rules.push(
      [
        "@font-face {",
        `  font-family: '${family}';`,
        `  font-style: ${style};`,
        `  font-weight: ${weightDecl};`,
        "  font-display: swap;",
        `  src: url('./${filename}') format('woff2');`,
        "}",
      ].join("\n"),
    );
    console.log(
      `[fetch-fonts] ${family} ${weightDecl} ${style} -> ${filename}` +
        (group.length > 1 ? ` (${group.length} weights collapsed into one file)` : ""),
    );
  }

  writeFileSync(join(fontsDir, "fonts.css"), rules.join("\n\n") + "\n");
  console.log(`[fetch-fonts] wrote fonts.css with ${rules.length} face(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
