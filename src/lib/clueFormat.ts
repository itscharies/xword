// Some sources (notably the Guardian) embed inline HTML in clue text — e.g.
// `<i>Lion King</i><span> baddie</span> (4)`. Keep a small whitelist of inline
// formatting tags and strip everything else (including all attributes), so the
// result is safe to drop into dangerouslySetInnerHTML. The New Yorker instead
// marks italics as `{/…/}` in its markdown payload — mapped to <i> here, ahead
// of the sanitising pass.

const ALLOWED = new Set(["i", "b", "em", "strong", "sub", "sup", "u"]);

export function formatClue(html: string): string {
  return html
    .replace(/\{\/(.*?)\/\}/g, "<i>$1</i>")
    .replace(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g, (m, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return ""; // drop span/script/img/anchor/etc. entirely
      return m.startsWith("</") ? `</${t}>` : `<${t}>`; // keep tag, drop attributes
    });
}

/** Word-length enumeration for a clue — the source's own comma-separated
 * breakdown (e.g. "4,5") when it provides one, otherwise the total answer
 * length, so every clue shows a count even for sources that don't enumerate. */
export function clueEnumeration(clue: { len: number; enumeration?: string }): string {
  return clue.enumeration ?? String(clue.len);
}

/** Short display label for a clue, e.g. "1D" / "12A". */
export function clueLabel(number: number, direction: "across" | "down"): string {
  return `${number}${direction === "across" ? "A" : "D"}`;
}
