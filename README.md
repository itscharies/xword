# The Daily Grid

A self-hosted, fully playable crossword app that gathers each day's puzzles
from several papers — NY Times, LA Times, Seattle Times, the Guardian, the
New Yorker and the Independent — into one clean, ad-free place. See
**Sources** below for the full list and how each is fetched.

Puzzles are fetched and parsed into clean JSON ahead of time and stored in
Supabase; the app itself is a static React site that only ever reads our own
data (no CORS issues, no answers shipped raw from the source).

## How it works

```
scripts/fetch-all.ts              run every fetcher, each in its own process
scripts/fetch-<source>.ts         fetch one source's new dates
scripts/parse*.ts                 decode each source's raw format -> Puzzle JSON
scripts/puzzleStore.ts            shared write path into the syndicated_puzzles table
src/lib/sources.ts                the source registry (labels, order)
src/                              the React + TypeScript solving UI
.github/workflows/fetch-daily.yml hourly cron running the fetch; puzzles go
                                  straight to Supabase, no commit or redeploy
```

Sources span six papers:

- **NY Times** (`nyt`) — pzzl text format, id `YYMMDD`.
- **Seattle Times** (AmuseLabs) — `st-large`, `st-mini` (dated ids) and
  `st-midi` (sequential `midi-crossword-<N>`, labelled by publishTime). The
  non-large *regular* set is deactivated upstream.
- **LA Times** (`latimes`) — the LA Times' own AmuseLabs instance
  (`lat.amuselabs.com`, ids `tcaYYMMDD`), reusing the Seattle Times
  descrambler/parser — this feed carries circled cells, which the old Andrews
  McMeel uclick XML didn't. The player needs a `loadToken` (minted by the
  date-picker page) plus an `fvlt` checksum; see `fetch-latimes.ts`.
- **Guardian** — `gdn-quick`, `gdn-cryptic`, `gdn-quiptic`, `gdn-quick-cryptic`,
  `gdn-prize`, `gdn-mini`; each puzzle's data is embedded in its page `.json`,
  walked back by number per type. (Everyman is an Observer puzzle, gone from
  the Guardian since ~April 2025, so it isn't available.)
- **New Yorker** (`tny-crossword`, `tny-mini`) — each date's page embeds a game
  UUID; the puzzle comes from the Condé puzzles API as a markdown payload
  (grid + clues).
- **Independent** (`ind-sunday`, `ind-cryptic`, `ind-mini`) — Arkadium's
  per-day feeds, keyed by plain date string: Crossword Compiler XML for the
  cryptic and mini, classic AcrossLite `.puz` for the Sunday crossword.

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
npm run dev       # start the dev server (http://localhost:5173)
npm run dev:mock  # same, against an in-memory mock backend (no Supabase needed)
npm run fetch     # run every fetcher, writing new puzzles to Supabase
```

Supabase credentials go in `.env.local` — see `.env.local.example`. The fetch
scripts additionally need `SUPABASE_SERVICE_ROLE_KEY` there; the browser
bundle never does.

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
subpath. The hourly GitHub Action fetches new puzzles straight into Supabase,
so they appear in the app without a rebuild or redeploy.
