// Look up a short definition/summary for a suggested word, for the builder's
// hover popover. Crossword entries are uppercased and space-stripped (REDCARPET,
// AARON, NASA), so we search Wikipedia (tolerant of spacing, great for names and
// phrases) and fall back to a plain dictionary for ordinary words. Both APIs are
// free, keyless and CORS-enabled — no backend needed. Results are cached.

export interface Definition {
  title: string;
  extract: string;
  url: string;
  source: "wikipedia" | "dictionary";
}

const cache = new Map<string, Definition | null>();

const truncate = (s: string, n = 320) => {
  const t = s.trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t;
};

async function fromWikipedia(term: string): Promise<Definition | null> {
  // One request: search for the best-matching page and return its intro extract.
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrlimit=1&redirects=1&prop=extracts&exintro=1&explaintext=1" +
    `&gsrsearch=${encodeURIComponent(term)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = await r.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0] as {
    title?: string;
    extract?: string;
  };
  if (!page?.title || !page.extract) return null;
  return {
    title: page.title,
    extract: truncate(page.extract),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    source: "wikipedia",
  };
}

async function fromDictionary(term: string): Promise<Definition | null> {
  const word = term.toLowerCase();
  const r = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
  );
  if (!r.ok) return null;
  const data = await r.json();
  const entry = Array.isArray(data) ? data[0] : null;
  const def = entry?.meanings?.[0]?.definitions?.[0]?.definition as
    | string
    | undefined;
  if (!def) return null;
  return {
    title: entry.word ?? word,
    extract: truncate(def),
    url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    source: "dictionary",
  };
}

/** Best-effort short definition for a term, or null if nothing was found. */
export async function define(term: string): Promise<Definition | null> {
  const key = term.toUpperCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let result: Definition | null = null;
  try {
    result = await fromWikipedia(term);
  } catch {
    /* network / parse — try the next source */
  }
  if (!result) {
    try {
      result = await fromDictionary(term);
    } catch {
      /* ignore */
    }
  }
  cache.set(key, result);
  return result;
}

export const googleUrl = (term: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(term)}`;
