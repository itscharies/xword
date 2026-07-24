/** Body of the "About the puzzles" modal — where each crossword is sourced
 * from, and the site's (non-)relationship to the papers that publish them. */
export function AboutPuzzles() {
  return (
    <div className="howto">
      <section>
        <p>
          The Daily Grid is an independent, free, non-commercial project. It has
          no affiliation with — and is not endorsed by — any of the papers,
          publishers, or constructors whose puzzles appear here.
        </p>
        <p>
          Every syndicated puzzle in the archive is collected from a page where
          its publisher already offers it to play online for free, without a
          paywall or an account. This site doesn't republish anything that
          isn't already freely playable — it simply provides another place to
          play the same puzzles.
        </p>
      </section>

      <section>
        <h3>Where each puzzle comes from</h3>
        <ul>
          <li>
            <b>NY Times</b> — the syndicated edition of the NYT crossword,
            which runs about five weeks behind the Times' own daily puzzle and
            is free to play on the Seattle Times' website.
          </li>
          <li>
            <b>Seattle Times</b> — the paper's own free daily crosswords
            (large, mini and midi).
          </li>
          <li>
            <b>LA Times</b> — the free daily crossword on latimes.com.
          </li>
          <li>
            <b>The Guardian</b> — the free crosswords on theguardian.com
            (quick, cryptic, quiptic, quick cryptic, prize and mini).
          </li>
          <li>
            <b>The New Yorker</b> — the free crossword and mini on
            newyorker.com.
          </li>
          <li>
            <b>The Independent</b> — the free crosswords on independent.co.uk
            (Sunday, cryptic and mini).
          </li>
        </ul>
      </section>

      <section>
        <h3>Copyright</h3>
        <p>
          All puzzles remain the copyright of their respective publishers and
          authors, and every puzzle here credits its constructor. Nothing is
          sold, no ads are shown, and no paywalled content is accessed.
        </p>
        <p>
          If you're a rights holder and would like a puzzle or source removed,
          open an issue on{" "}
          <a href="https://github.com/itscharies/xword" target="_blank" rel="noreferrer">
            GitHub
          </a>{" "}
          and it will be taken down promptly.
        </p>
      </section>
    </div>
  );
}
