// Generate public/og.png — the social-share preview image (1200x630).
// Downloads the SN Pro font so the text matches the site, then renders the
// SVG to PNG. Run: npm run og
import { Resvg } from "@resvg/resvg-js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200;
const H = 630;

/** Fetch the SN Pro weights as .ttf files (an old UA makes Google serve ttf,
 * which resvg can read — unlike woff2). Returns local file paths. */
async function loadSnPro(): Promise<string[]> {
  const css = await fetch(
    "https://fonts.googleapis.com/css2?family=SN+Pro:wght@500;600;800&display=swap",
    { headers: { "User-Agent": "Mozilla/5.0" } },
  ).then((r) => r.text());
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]);
  const dir = mkdtempSync(join(tmpdir(), "snpro-"));
  const files: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const buf = Buffer.from(await fetch(urls[i]).then((r) => r.arrayBuffer()));
    const p = join(dir, `snpro-${i}.ttf`);
    writeFileSync(p, buf);
    files.push(p);
  }
  return files;
}

// ---- 5x5 crossword motif, vertically centred -----------------------------
const cell = 76;
const gap = 8;
const span = 5 * cell + 4 * gap; // 412
const ox = 84;
const oy = (H - span) / 2; // centred vertically
const blocked = new Set(["1,1", "3,0", "0,3", "2,2", "4,3"]);
const accent = new Set(["0,0", "4,0", "2,4"]);

let cells = "";
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const x = ox + c * (cell + gap);
    const y = oy + r * (cell + gap);
    const key = `${c},${r}`;
    const fill = blocked.has(key) ? "#0d0d0d" : accent.has(key) ? "#ffe500" : "#ededed";
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`;
  }
}

// ---- text block, vertically centred to match the grid --------------------
const tx = ox + span + 60; // 556
const ff = "SN Pro";
const text = `
  <text x="${tx}" y="288" font-family="${ff}" font-size="112" font-weight="800" fill="#ffe500">Crossword</text>
  <text x="${tx + 4}" y="350" font-family="${ff}" font-size="34" font-weight="500" fill="#e6e6e6">The daily New York Times puzzle —</text>
  <text x="${tx + 4}" y="396" font-family="${ff}" font-size="34" font-weight="500" fill="#e6e6e6">free and ad-free.</text>
  <text x="${tx + 4}" y="476" font-family="${ff}" font-size="26" font-weight="600" fill="#8a8a8a">itscharies.github.io/xword</text>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#8a7b00" stroke-width="6"/>
  ${cells}
  ${text}
</svg>`;

const fontFiles = await loadSnPro();
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { loadSystemFonts: false, fontFiles, defaultFontFamily: "SN Pro" },
})
  .render()
  .asPng();

const out = join(__dirname, "..", "public", "og.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes) with ${fontFiles.length} font file(s)`);
