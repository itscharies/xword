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

/** Fetch a Google font's .ttf files (a bare UA makes Google serve ttf, which
 * resvg can read — unlike woff2). Returns local file paths. */
async function loadFont(cssUrl: string, prefix: string): Promise<string[]> {
  const css = await fetch(cssUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]);
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const files: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const ab = await fetch(urls[i]).then((r) => r.arrayBuffer());
    const p = join(dir, `${prefix}${i}.ttf`);
    writeFileSync(p, new Uint8Array(ab));
    files.push(p);
  }
  return files;
}

// ---- 5x5 crossword motif, vertically centred -----------------------------
// Theme colours (match the app).
const BG = "#1c1c1c"; // slightly-lighter page background
const SHADOW = "#000000"; // harsh offset shadow
const GRIDLINE = "#000000";
const OPEN = "#ededed"; // white cells, like the title logo
const BLOCK = "#000000";
const ACTIVE = "#ffe500"; // the main highlight (active square)
const WORD = "#c9b200"; // the rest of the highlighted word, dimmer

// ---- 5x5 motif: one highlighted word (bright active cell + dimmer word),
//      black/white crossword pattern around it — vertically centred. ----
const cell = 76;
const gap = 8;
const span = 5 * cell + 4 * gap; // 412
const ox = 96;
const oy = (H - span) / 2;
const SH = 16; // harsh shadow offset

// Per-cell fill from the requested layout (row 1 is the highlighted word;
// (1,1) is the active square).
const fillAt = (c: number, r: number): string => {
  if (r === 1) return c === 1 ? ACTIVE : WORD;
  if (r === 3) return OPEN;
  // rows 0,2,4: block / open / block / open / block
  return c % 2 === 0 ? BLOCK : OPEN;
};

let cells = "";
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const x = ox + c * (cell + gap);
    const y = oy + r * (cell + gap);
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fillAt(c, r)}"/>`;
  }
}

const grid = `
  <rect x="${ox - gap + SH}" y="${oy - gap + SH}" width="${span + 2 * gap}" height="${span + 2 * gap}" fill="${SHADOW}"/>
  <rect x="${ox - gap}" y="${oy - gap}" width="${span + 2 * gap}" height="${span + 2 * gap}" fill="${GRIDLINE}"/>
  ${cells}
`;

// ---- text block: the wordmark in white (like the site logo) + tagline,
//      vertically centred as a group. ----
const tx = ox + span + 76;
type Line = {
  t: string;
  size: number;
  font: string;
  fill: string;
  weight?: number;
  brand?: boolean;
  gap: number;
};
const lines: Line[] = [
  { t: "The Daily", size: 100, font: "Jaro", fill: OPEN, brand: true, gap: 6 },
  { t: "Grid", size: 100, font: "Jaro", fill: OPEN, brand: true, gap: 36 },
  { t: "Every day's crosswords —", size: 32, font: "SN Pro", fill: "#e6e6e6", weight: 500, gap: 6 },
  { t: "every paper, one place.", size: 32, font: "SN Pro", fill: "#e6e6e6", weight: 500, gap: 30 },
  { t: "itscharies.github.io/xword", size: 26, font: "SN Pro", fill: "#8a8a8a", weight: 600, gap: 0 },
];
const totalH = lines.reduce((s, l) => s + l.size + l.gap, 0) - lines[lines.length - 1].gap;
let top = H / 2 - totalH / 2;
let text = "";
for (const l of lines) {
  const baseline = top + l.size * 0.78;
  const w = l.weight ? ` font-weight="${l.weight}"` : "";
  if (l.brand) {
    // harsh offset shadow behind, white wordmark on top
    text += `<text x="${tx + SH}" y="${baseline + SH}" font-family="${l.font}" font-size="${l.size}" fill="${SHADOW}">${l.t}</text>`;
    text += `<text x="${tx}" y="${baseline}" font-family="${l.font}" font-size="${l.size}" fill="${l.fill}">${l.t}</text>`;
  } else {
    text += `<text x="${tx}" y="${baseline}" font-family="${l.font}" font-size="${l.size}"${w} fill="${l.fill}">${l.t}</text>`;
  }
  top += l.size + l.gap;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${grid}
  ${text}
</svg>`;

const snPro = await loadFont(
  "https://fonts.googleapis.com/css2?family=SN+Pro:wght@500;600;800&display=swap",
  "snpro-",
);
const jaro = await loadFont(
  "https://fonts.googleapis.com/css2?family=Jaro:opsz@6..72&display=swap",
  "jaro-",
);
const fontFiles = [...snPro, ...jaro];
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { loadSystemFonts: false, fontFiles, defaultFontFamily: "SN Pro" },
})
  .render()
  .asPng();

const out = join(__dirname, "..", "public", "og.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes) with ${fontFiles.length} font file(s)`);
