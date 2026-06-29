// Generate the PNG app icons from the "T" favicon mark (iOS home screen needs
// a PNG apple-touch-icon; Android/PWA need 192/512). The grid is centred with
// padding so it survives Android's maskable crop. Run: npm run icons
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = (n: string) => join(__dirname, "..", "public", n);

const SIZE = 512;
const BG = "#1c1c1c";
const GRID = "#000000";
const OPEN = "#ededed";
const BLOCK = "#000000";
const ACTIVE = "#ffe500";
const WORD = "#c9b200";

// 3x3 "T", centred at ~60% so it sits inside the maskable safe zone.
const G = 300;
const gap = 14;
const cellSz = (G - 2 * gap) / 3;
const off = (SIZE - G) / 2;
const p = [off, off + cellSz + gap, off + 2 * (cellSz + gap)];
const fillAt = (c: number, r: number) =>
  r === 0 ? (c === 1 ? ACTIVE : WORD) : c === 1 ? OPEN : BLOCK;

let cells = "";
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    cells += `<rect x="${p[c]}" y="${p[r]}" width="${cellSz}" height="${cellSz}" fill="${fillAt(c, r)}"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <rect x="${off - gap}" y="${off - gap}" width="${G + 2 * gap}" height="${G + 2 * gap}" fill="${GRID}"/>
  ${cells}
</svg>`;

const targets: Array<[number, string]> = [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
];
for (const [size, name] of targets) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(pub(name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
