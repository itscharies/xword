# xword

A self-hosted, fully playable crossword app for the New York Times syndicated
puzzle (as published by the Seattle Times via `nytsyn.pzzl.com`).

Puzzles are fetched and parsed into clean JSON ahead of time, then served as a
static React site — so the browser only ever reads our own JSON (no CORS issues,
no answers shipped raw from the source).

## How it works

```
scripts/fetch-puzzles.ts   fetch the list + each new date, parse, write JSON
scripts/parse.ts           decode the raw pzzl.com text format -> Puzzle JSON
public/puzzles/<date>.json  one parsed puzzle per date (YYMMDD)
public/puzzles/index.json   the catalogue the app loads first (newest first)
src/                        the React + TypeScript solving UI
.github/workflows/          a daily cron that runs the fetch and commits new JSON
```

### The source format

For `?date=YYMMDD` the endpoint returns a newline-delimited payload:

```
ARCHIVE                              marker
260523                               edition id (ignored)
NY Times, Sat, Jun 27, 2026          title
Kameron Austin Collins / Will Shortz author / editor
15                                   width
15                                   height
31                                   # across clues
31                                   # down clues
<height grid rows>                   '#' black, '.' void, '^' prefixes a circled letter
<across clues>                       in clue-number order
<down clues>                         in clue-number order
```

The grid is numbered with standard crossword rules and clues are matched to word
starts in order. The source is served as Windows-1252, so accents (e.g.
"soupçon", "50¢") are decoded explicitly.

## Develop

```sh
npm install
npm run fetch     # populate public/puzzles from the source
npm run dev       # start the dev server (http://localhost:5173)
```

Other scripts:

```sh
npm run build       # type-check + production build into dist/
npm run parse:test  # sanity-check the parser against the live sample
```

## Solving

- Click a cell or clue to start; click again (or press space) to switch
  across/down. Arrow keys, Tab / Shift-Tab move between cells and clues.
- **Check** and **Reveal** work on the current cell, word, or whole puzzle.
- A built-in on-screen keyboard appears on touch devices.
- Progress, revealed cells, and the timer are saved per puzzle in
  `localStorage`, so you can leave and come back.

## Deploy

`npm run build` produces a fully static `dist/` that can be hosted anywhere
(GitHub Pages, Netlify, S3, …). The Vite `base` is `./`, so it works under a
subpath. The daily GitHub Action keeps `public/puzzles/` growing; rebuild/redeploy
after it commits (or wire the deploy into the same workflow).
