import type { Cell, Clue, Puzzle } from "../src/types.ts";
import type { PuzzleSource } from "../src/lib/sources.ts";
import { SOURCES } from "../src/lib/sources.ts";
import { isoFromYymmdd, weekdayFromIso } from "./dates.ts";

/**
 * Parse the classic AcrossLite `.puz` binary format (as served by Arkadium's
 * Stanley Newman Sunday Crossword feed). Layout, per the format long-documented
 * at https://code.google.com/archive/p/puz/wikis/FileFormat.wiki:
 *
 *   0x00  file checksum (2 bytes, unused here)
 *   0x02  "ACROSS&DOWN\0" magic (12 bytes)
 *   0x0E  CIB checksum (2 bytes)
 *   0x10  masked low checksums (4 bytes)
 *   0x14  masked high checksums (4 bytes)
 *   0x18  version string, e.g. "1.3\0" (4 bytes)
 *   0x1C  reserved (2 bytes)
 *   0x1E  scrambled checksum (2 bytes) — nonzero means the grid is scrambled
 *   0x20  reserved (12 bytes)
 *   0x2C  width (1 byte)
 *   0x2D  height (1 byte)
 *   0x2E  number of clues (2 bytes LE)
 *   0x30  unknown bitmask (2 bytes)
 *   0x32  scrambled tag (2 bytes) — 0 if not scrambled
 *   0x34  solution grid (width*height bytes, '.' = block)
 *         player-state grid (width*height bytes, ignored)
 *         then \0-terminated strings: title, author, copyright, each clue in
 *         grid reading order, notes.
 */
export function parsePuz(buf: Buffer, source: PuzzleSource, date: string): Puzzle {
  if (buf.toString("latin1", 0x02, 0x0e) !== "ACROSS&DOWN\0") {
    throw new Error(`${date}: not a .puz file (bad magic)`);
  }
  const width = buf.readUInt8(0x2c);
  const height = buf.readUInt8(0x2d);
  const numClues = buf.readUInt16LE(0x2e);
  const scrambledTag = buf.readUInt16LE(0x32);
  if (scrambledTag !== 0) {
    throw new Error(`${date}: grid is scrambled — unscrambling isn't supported`);
  }

  const gridStart = 0x34;
  const solution = buf.toString("latin1", gridStart, gridStart + width * height);

  const grid: Cell[][] = Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => {
      const ch = solution[row * width + col];
      return ch === "." ? ({ black: true } as Cell) : ({ solution: ch.toUpperCase() } as Cell);
    }),
  );

  const stringsStart = gridStart + 2 * width * height;
  const strings = buf
    .toString("latin1", stringsStart)
    .split("\0")
    .slice(0, 3 + numClues + 1); // title, author, copyright, clues..., notes
  const [title, author] = strings;
  const clueTexts = strings.slice(3, 3 + numClues);

  const isBlack = (row: number, col: number) =>
    row < 0 || row >= height || col < 0 || col >= width || grid[row][col].black;

  const across: Clue[] = [];
  const down: Clue[] = [];
  let number = 0;
  let clueIndex = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isBlack(row, col)) continue;
      const startsAcross = isBlack(row, col - 1) && !isBlack(row, col + 1);
      const startsDown = isBlack(row - 1, col) && !isBlack(row + 1, col);
      if (!startsAcross && !startsDown) continue;
      number++;
      grid[row][col].number = number;
      if (startsAcross) {
        let len = 0;
        while (!isBlack(row, col + len)) len++;
        const answer = solution.slice(row * width + col, row * width + col + len).toUpperCase();
        across.push({ number, clue: clueTexts[clueIndex++] ?? "", answer, row, col, len });
      }
      if (startsDown) {
        let len = 0;
        while (!isBlack(row + len, col)) len++;
        let answer = "";
        for (let i = 0; i < len; i++) answer += solution[(row + i) * width + col];
        down.push({
          number,
          clue: clueTexts[clueIndex++] ?? "",
          answer: answer.toUpperCase(),
          row,
          col,
          len,
        });
      }
    }
  }

  const iso = isoFromYymmdd(date);
  return {
    source,
    date,
    isoDate: iso,
    weekday: weekdayFromIso(iso),
    title: SOURCES[source].label,
    author: author || title || "",
    editor: "",
    width,
    height,
    grid,
    clues: { across, down },
  };
}
