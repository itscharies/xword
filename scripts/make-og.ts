// Generate public/og.png — the social-share preview image (1200x630).
// Run: npx tsx scripts/make-og.ts
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200;
const H = 630;
const size = 78;
const gap = 8;
const ox = 90;
const oy = 134;

const blocked = new Set(["1,1", "3,0", "0,3", "2,2", "4,3"]);
const accent = new Set(["0,0", "4,0", "2,4"]);

let cells = "";
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const x = ox + c * (size + gap);
    const y = oy + r * (size + gap);
    const key = `${c},${r}`;
    const fill = blocked.has(key) ? "#0d0d0d" : accent.has(key) ? "#ffe500" : "#ededed";
    cells += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"/>`;
  }
}

const font = "Helvetica, Arial, sans-serif";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#8a7b00" stroke-width="6"/>
  ${cells}
  <text x="560" y="290" font-family="${font}" font-size="118" font-weight="800" fill="#ffe500">Crossword</text>
  <text x="564" y="356" font-family="${font}" font-size="38" font-weight="500" fill="#e6e6e6">The daily New York Times puzzle,</text>
  <text x="564" y="406" font-family="${font}" font-size="38" font-weight="500" fill="#e6e6e6">free and ad-free.</text>
  <text x="564" y="520" font-family="${font}" font-size="28" font-weight="600" fill="#8a8a8a">itscharies.github.io/xword</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { loadSystemFonts: true },
})
  .render()
  .asPng();

const out = join(__dirname, "..", "public", "og.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
