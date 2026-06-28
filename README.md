# xword

A self-hosted, fully playable crossword app. It pulls from two sources:

- **NY Times syndicated** — as published by the Seattle Times via `nytsyn.pzzl.com`.
- **Seattle Times Crossword** — the Penny Press puzzle served through AmuseLabs
  (PuzzleMe), decoded from its scrambled `rawc` payload.

Puzzles are fetched and parsed into clean JSON ahead of time, then served as a
static React site — so the browser only ever reads our own JSON (no CORS issues,
no answers shipped raw from the source).

## How it works

```
scripts/fetch-puzzles.ts          fetch NYT (pzzl): list + each new date
scripts/parse.ts                  decode the raw pzzl.com text format -> Puzzle JSON
scripts/fetch-amuse.ts            fetch Seattle Times (AmuseLabs) by date
scripts/parse-amuse.ts            descramble + decode the rawc payload -> Puzzle JSON
scripts/build-index.ts            rebuild the unified index across all sources
public/puzzles/<source>/<date>.json  one parsed puzzle per source+date
public/puzzles/index.json            the catalogue the app loads first (newest first)
src/lib/sources.ts                the source registry (labels, order)
src/                              the React + TypeScript solving UI
.github/workflows/                a daily cron that runs the fetch and commits new JSON
```

Sources span four papers:

- **NY Times** (`nyt`) — pzzl text format, id `YYMMDD`.
- **Seattle Times** (AmuseLabs) — `st-large`, `st-mini` (dated ids) and
  `st-midi` (sequential `midi-crossword-<N>`, labelled by publishTime). The
  non-large *regular* set is deactivated upstream.
- **LA Times** (`latimes`) — Andrews McMeel uclick XML, via the Seattle Times'
  free puzzle-society embed (a public subscription-id authenticates the API).
- **Guardian** — `gdn-quick`, `gdn-cryptic`, `gdn-quiptic`, `gdn-quick-cryptic`,
  `gdn-prize`, `gdn-mini`; each puzzle's data is embedded in its page `.json`,
  walked back by number per type. (Everyman is an Observer puzzle, gone from
  the Guardian since ~April 2025, so it isn't available.)
- **New Yorker** (`tny-crossword`, `tny-mini`) — each date's page embeds a game
  UUID; the puzzle comes from the Condé puzzles API as a markdown payload
  (grid + clues).

Each source has a `paper` and a `type`, which drive the archive's two filters.

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
