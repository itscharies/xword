// Some sources (notably the Guardian) embed inline HTML in clue text — e.g.
// `<i>Lion King</i><span> baddie</span> (4)`. Keep a small whitelist of inline
// formatting tags and strip everything else (including all attributes), so the
// result is safe to drop into dangerouslySetInnerHTML.

const ALLOWED = new Set(["i", "b", "em", "strong", "sub", "sup", "u"]);

export function formatClue(html: string): string {
  return html.replace(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g, (m, tag: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return ""; // drop span/script/img/anchor/etc. entirely
    return m.startsWith("</") ? `</${t}>` : `<${t}>`; // keep tag, drop attributes
  });
}
