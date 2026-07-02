// Fill-suggestion word list for the /create builder. Lazy-loaded (only when the
// builder asks for it) from public/wordlist.txt — a `WORD;score` list derived
// from Spread the Word(list) (CC BY-NC-SA 4.0; see public/wordlist.LICENSE.txt).

export interface Suggestion {
  word: string;
  score: number;
}

let loadPromise: Promise<Map<number, Suggestion[]>> | null = null;

function parse(text: string): Map<number, Suggestion[]> {
  const byLen = new Map<number, Suggestion[]>();
  for (const line of text.split("\n")) {
    const i = line.indexOf(";");
    if (i < 1) continue;
    const word = line.slice(0, i);
    const score = Number(line.slice(i + 1));
    const arr = byLen.get(word.length);
    if (arr) arr.push({ word, score });
    else byLen.set(word.length, [{ word, score }]);
  }
  // Sort each length bucket by score so top matches surface first.
  for (const arr of byLen.values()) arr.sort((a, b) => b.score - a.score);
  return byLen;
}

/** Fetch + index the word list once; the result is cached for later calls. */
export function loadWordlist(): Promise<Map<number, Suggestion[]>> {
  if (!loadPromise) {
    const url = import.meta.env.BASE_URL + "wordlist.txt";
    loadPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`wordlist ${r.status}`);
        return r.text();
      })
      .then(parse)
      .catch((e) => {
        loadPromise = null; // allow a retry on the next call
        throw e;
      });
  }
  return loadPromise;
}

/**
 * Words matching `pattern` — uppercase letters with "." for unknown cells,
 * e.g. ".A..E" — ranked by score, capped at `limit`. A blank pattern returns
 * the top-scored words of that length.
 */
export async function suggest(
  pattern: string,
  limit = 200,
): Promise<Suggestion[]> {
  const byLen = await loadWordlist();
  const bucket = byLen.get(pattern.length);
  if (!bucket) return [];
  const fixed: Array<[number, string]> = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== ".") fixed.push([i, pattern[i]]);
  }
  const out: Suggestion[] = [];
  for (const s of bucket) {
    let ok = true;
    for (const [i, ch] of fixed) {
      if (s.word[i] !== ch) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}
